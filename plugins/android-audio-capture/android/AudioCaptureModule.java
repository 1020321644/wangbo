package com.audiophile.converter;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * Android 系统内录原生模块
 * 使用 MediaProjection API 捕获系统音频
 */
@RequiresApi(api = Build.VERSION_CODES.Q)
public class AudioCaptureModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME = "AudioCaptureModule";
    private static final int REQUEST_CODE_MEDIA_PROJECTION = 1001;

    private final ReactApplicationContext reactContext;
    private MediaProjectionManager mediaProjectionManager;
    private MediaProjection mediaProjection;
    private AudioRecord audioRecord;
    private Promise requestPermissionPromise;
    private int resultCode;
    private Intent resultData;
    private boolean isRecording = false;

    // 音频参数
    private static final int SAMPLE_RATE = 48000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_STEREO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int BUFFER_SIZE = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            CHANNEL_CONFIG,
            AUDIO_FORMAT
    ) * 2;

    /**
     * ActivityEventListener 处理系统弹窗回调
     * 这是关键！必须正确挂载才能收到用户点击"允许"的反馈
     */
    private final ActivityEventListener activityEventListener = new BaseActivityEventListener() {
        @Override
        public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
            if (requestCode == REQUEST_CODE_MEDIA_PROJECTION) {
                if (resultCode == Activity.RESULT_OK && data != null) {
                    // ✅ 用户点了"允许"，这里一定能进来！
                    // 把 resultCode 和 data 保存为全局变量，然后你就可以去启动 MediaProjection 内录了
                    AudioCaptureModule.this.resultCode = resultCode;
                    AudioCaptureModule.this.resultData = data;

                    if (requestPermissionPromise != null) {
                        WritableMap result = Arguments.createMap();
                        result.putBoolean("granted", true);
                        requestPermissionPromise.resolve(result);
                        requestPermissionPromise = null;
                    }

                    // 发送事件到 JS
                    sendEvent("onPermissionGranted", null);
                } else {
                    // 用户点了"取消"
                    if (requestPermissionPromise != null) {
                        requestPermissionPromise.reject("PERMISSION_DENIED", "用户拒绝了屏幕录制权限");
                        requestPermissionPromise = null;
                    }
                }
            }
        }
    };

    public AudioCaptureModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.mediaProjectionManager = (MediaProjectionManager) reactContext
                .getSystemService(Context.MEDIA_PROJECTION_SERVICE);

        // ⚠️ 关键：在 init 方法里注册它
        reactContext.addActivityEventListener(activityEventListener);
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * 请求系统内录权限
     * 重点：你的弹窗调用必须是 currentActivity.startActivityForResult(...)，而不是普通的 startActivity(...)
     */
    @ReactMethod
    public void requestPermission(Promise promise) {
        Activity currentActivity = getCurrentActivity();
        if (currentActivity == null) {
            promise.reject("NO_ACTIVITY", "Activity is null");
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.reject("API_LEVEL_TOO_LOW", "需要 Android 10 (API 29) 或更高版本");
            return;
        }

        requestPermissionPromise = promise;

        // 创建 MediaProjection 权限请求 Intent
        Intent intent = mediaProjectionManager.createScreenCaptureIntent();

        // ⚠️ 关键：必须使用 startActivityForResult，否则无法触发上面的回调
        currentActivity.startActivityForResult(intent, REQUEST_CODE_MEDIA_PROJECTION);
    }

    /**
     * 开始录制系统音频
     */
    @ReactMethod
    public void startCapture(Promise promise) {
        if (resultCode == 0 || resultData == null) {
            promise.reject("NO_PERMISSION", "请先调用 requestPermission 获取权限");
            return;
        }

        if (isRecording) {
            promise.reject("ALREADY_RECORDING", "已经在录制中");
            return;
        }

        try {
            // 创建 MediaProjection
            mediaProjection = mediaProjectionManager.getMediaProjection(resultCode, resultData);

            if (mediaProjection == null) {
                promise.reject("MEDIA_PROJECTION_NULL", "无法创建 MediaProjection");
                return;
            }

            // 创建 AudioRecord（使用 MediaProjection 作为音频源）
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                AudioFormat audioFormat = new AudioFormat.Builder()
                        .setEncoding(AUDIO_FORMAT)
                        .setSampleRate(SAMPLE_RATE)
                        .setChannelMask(CHANNEL_CONFIG)
                        .build();

                audioRecord = new AudioRecord.Builder()
                        .setAudioFormat(audioFormat)
                        .setBufferSizeInBytes(BUFFER_SIZE)
                        .build();

                // 开始录制
                audioRecord.startRecording();
                isRecording = true;

                // 在后台线程读取音频数据
                startAudioCapture();

                WritableMap result = Arguments.createMap();
                result.putBoolean("success", true);
                promise.resolve(result);
            } else {
                promise.reject("API_LEVEL_TOO_LOW", "需要 Android 10 或更高版本");
            }
        } catch (Exception e) {
            promise.reject("START_CAPTURE_ERROR", e.getMessage());
        }
    }

    /**
     * 停止录制
     */
    @ReactMethod
    public void stopCapture(Promise promise) {
        try {
            isRecording = false;

            if (audioRecord != null) {
                audioRecord.stop();
                audioRecord.release();
                audioRecord = null;
            }

            if (mediaProjection != null) {
                mediaProjection.stop();
                mediaProjection = null;
            }

            WritableMap result = Arguments.createMap();
            result.putBoolean("success", true);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("STOP_CAPTURE_ERROR", e.getMessage());
        }
    }

    /**
     * 检查是否支持系统内录
     */
    @ReactMethod
    public void isSupported(Promise promise) {
        WritableMap result = Arguments.createMap();
        result.putBoolean("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q);
        result.putInt("apiLevel", Build.VERSION.SDK_INT);
        promise.resolve(result);
    }

    /**
     * 后台线程读取音频数据
     */
    private void startAudioCapture() {
        new Thread(() -> {
            byte[] buffer = new byte[BUFFER_SIZE];

            while (isRecording && audioRecord != null) {
                int bytesRead = audioRecord.read(buffer, 0, buffer.length);

                if (bytesRead > 0) {
                    // 将音频数据发送到 JS 层
                    WritableMap audioData = Arguments.createMap();
                    audioData.putInt("bytesRead", bytesRead);
                    // TODO: 将 buffer 转换为 Base64 或写入文件
                    sendEvent("onAudioData", audioData);
                }
            }
        }).start();
    }

    /**
     * 发送事件到 JS
     */
    private void sendEvent(String eventName, WritableMap params) {
        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
    }

    /**
     * 清理资源
     */
    @Override
    public void onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy();
        isRecording = false;

        if (audioRecord != null) {
            audioRecord.stop();
            audioRecord.release();
            audioRecord = null;
        }

        if (mediaProjection != null) {
            mediaProjection.stop();
            mediaProjection = null;
        }

        reactContext.removeActivityEventListener(activityEventListener);
    }
}
