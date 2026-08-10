package com.miaoda.appdk2quyiid79d;

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.concurrent.TimeUnit;

/**
 * ADB 无线授权原生模块
 * 功能：
 *  1. 检测 CAPTURE_AUDIO_OUTPUT 权限状态
 *  2. 检测无线调试端口（5555）是否开放
 *  3. 运行时从 assets 解压 adb 二进制并执行 pm grant 授权
 *  4. 检测是否为鸿蒙系统
 */
public class AdbAuthModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME    = "AdbAuthModule";
    private static final String PERMISSION     = "android.permission.CAPTURE_AUDIO_OUTPUT";
    private static final int    ADB_PORT       = 5555;
    private static final int    CONNECT_TIMEOUT = 1500; // ms

    private final ReactApplicationContext reactContext;

    public AdbAuthModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    // ─── 1. 检测 CAPTURE_AUDIO_OUTPUT 权限 ───────────────────────────────────

    @ReactMethod
    public void checkCapturePermission(Promise promise) {
        try {
            Context ctx      = reactContext.getApplicationContext();
            String  pkg      = ctx.getPackageName();
            int     result   = ctx.getPackageManager().checkPermission(PERMISSION, pkg);
            boolean granted  = (result == PackageManager.PERMISSION_GRANTED);

            WritableMap map = Arguments.createMap();
            map.putBoolean("granted", granted);
            promise.resolve(map);
        } catch (Exception e) {
            promise.reject("CHECK_PERM_ERROR", e.getMessage());
        }
    }

    // ─── 2. 检测无线调试端口 ────────────────────────────────────────────────

    @ReactMethod
    public void checkWirelessAdb(Promise promise) {
        new Thread(() -> {
            Socket socket = new Socket();
            try {
                socket.connect(new InetSocketAddress("127.0.0.1", ADB_PORT), CONNECT_TIMEOUT);
                socket.close();

                WritableMap map = Arguments.createMap();
                map.putBoolean("available", true);
                map.putInt("port", ADB_PORT);
                promise.resolve(map);
            } catch (Exception e) {
                try { socket.close(); } catch (IOException ignored) {}

                WritableMap map = Arguments.createMap();
                map.putBoolean("available", false);
                map.putInt("port", ADB_PORT);
                map.putString("reason", e.getMessage());
                promise.resolve(map);
            }
        }).start();
    }

    // ─── 3. 提取 adb 二进制并执行授权 ────────────────────────────────────────

    @ReactMethod
    public void runAdbGrant(Promise promise) {
        new Thread(() -> {
            try {
                // 3a. 提取 adb 二进制
                File adbFile = extractAdbBinary();
                if (adbFile == null) {
                    WritableMap map = Arguments.createMap();
                    map.putBoolean("success", false);
                    map.putString("error", "ADB_BINARY_NOT_FOUND");
                    map.putString("output", "assets/adb 文件不存在，请确认 CI 已下载 arm64 adb 二进制");
                    promise.resolve(map);
                    return;
                }

                String pkg = reactContext.getPackageName();
                StringBuilder log = new StringBuilder();

                // 3b. adb connect localhost:5555
                String connectOut = runProcess(adbFile, "connect", "127.0.0.1:" + ADB_PORT);
                log.append("[connect] ").append(connectOut).append("\n");

                // 3c. adb shell pm grant <pkg> CAPTURE_AUDIO_OUTPUT
                String grantOut = runProcess(
                        adbFile,
                        "-s", "127.0.0.1:" + ADB_PORT,
                        "shell", "pm", "grant", pkg, PERMISSION
                );
                log.append("[grant] ").append(grantOut).append("\n");

                // 3d. 验证权限是否已生效
                boolean nowGranted = isPermissionGranted();
                log.append("[verify] granted=").append(nowGranted).append("\n");

                WritableMap map = Arguments.createMap();
                map.putBoolean("success", nowGranted);
                map.putString("output", log.toString());
                promise.resolve(map);

            } catch (Exception e) {
                WritableMap map = Arguments.createMap();
                map.putBoolean("success", false);
                map.putString("error", e.getMessage());
                map.putString("output", "");
                promise.resolve(map);
            }
        }).start();
    }

    // ─── 4. 是否鸿蒙系统 ──────────────────────────────────────────────────────

    @ReactMethod
    public void isHarmonyOS(Promise promise) {
        boolean isHarmony = false;
        try {
            Class.forName("ohos.app.Context");
            isHarmony = true;
        } catch (ClassNotFoundException ignored) {
            // 也检测 Build 字段
            String manufacturer = Build.MANUFACTURER.toLowerCase();
            String fingerprint  = Build.FINGERPRINT.toLowerCase();
            isHarmony = manufacturer.contains("huawei") &&
                    (fingerprint.contains("harmony") || Build.VERSION.SDK_INT < 29);
        }
        WritableMap map = Arguments.createMap();
        map.putBoolean("isHarmony", isHarmony);
        map.putString("manufacturer", Build.MANUFACTURER);
        promise.resolve(map);
    }

    // ─── 5. 返回完整 ADB 授权命令（供复制到剪贴板）───────────────────────────

    @ReactMethod
    public void getAdbCommand(Promise promise) {
        String pkg = reactContext.getPackageName();
        WritableMap map = Arguments.createMap();
        map.putString("command",
                "adb shell pm grant " + pkg + " android.permission.CAPTURE_AUDIO_OUTPUT");
        promise.resolve(map);
    }

    // ─── 私有辅助方法 ─────────────────────────────────────────────────────────

    /**
     * 从 assets/adb 提取到缓存目录，chmod 755
     * @return adb File，不存在时返回 null
     */
    private File extractAdbBinary() {
        Context ctx    = reactContext.getApplicationContext();
        File    outFile = new File(ctx.getCacheDir(), "adb_exec");

        // 若已提取且可执行则直接复用
        if (outFile.exists() && outFile.canExecute()) {
            return outFile;
        }

        try (InputStream is = ctx.getAssets().open("adb");
             FileOutputStream fos = new FileOutputStream(outFile)) {

            byte[] buf = new byte[8192];
            int    n;
            while ((n = is.read(buf)) != -1) {
                fos.write(buf, 0, n);
            }
            fos.flush();

            // chmod 755
            boolean ok = outFile.setExecutable(true, false);
            if (!ok) {
                // fallback：通过 chmod 命令
                Runtime.getRuntime().exec(new String[]{"chmod", "755", outFile.getAbsolutePath()});
            }
            return outFile;

        } catch (IOException e) {
            // assets/adb 不存在
            return null;
        }
    }

    /** 运行子进程并返回 stdout+stderr 输出（最多等 10s） */
    private String runProcess(File adbBin, String... args) throws IOException, InterruptedException {
        String[] cmd = new String[args.length + 1];
        cmd[0] = adbBin.getAbsolutePath();
        System.arraycopy(args, 0, cmd, 1, args.length);

        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectErrorStream(true);
        Process proc = pb.start();

        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(proc.getInputStream()))) {
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line).append("\n");
            }
        }

        proc.waitFor(10, TimeUnit.SECONDS);
        return sb.toString().trim();
    }

    /** 直接检测权限（结果比 checkPermission API 更及时） */
    private boolean isPermissionGranted() {
        String pkg = reactContext.getPackageName();
        return reactContext.getPackageManager()
                .checkPermission(PERMISSION, pkg) == PackageManager.PERMISSION_GRANTED;
    }
}
