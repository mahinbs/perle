package com.syntraiq.com;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Native Android TextToSpeech for Capacitor WebViews where
 * window.speechSynthesis is missing or silently fails.
 */
@CapacitorPlugin(name = "NativeTts")
public class NativeTtsPlugin extends Plugin {
    private static final int MAX_CHUNK = 3500;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private boolean ready = false;
    private boolean initializing = false;
    private final List<Runnable> readyQueue = new ArrayList<>();
    private PluginCall pendingSpeakCall;
    private String activeUtteranceId;
    private final List<String> speakChunks = new ArrayList<>();
    private int speakChunkIndex = 0;
    private float pendingRate = 1f;
    private float pendingVolume = 1f;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;

    private void runOnUi(Runnable r) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            r.run();
        } else {
            mainHandler.post(r);
        }
    }

    private void ensureTts(Runnable onReady, PluginCall call) {
        runOnUi(() -> {
            if (tts != null && ready) {
                onReady.run();
                return;
            }

            readyQueue.add(onReady);
            if (initializing) return;

            initializing = true;
            Context ctx = getContext();
            audioManager = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);

            tts = new TextToSpeech(ctx, status -> runOnUi(() -> {
                ready = status == TextToSpeech.SUCCESS;
                initializing = false;
                if (!ready) {
                    readyQueue.clear();
                    if (call != null) {
                        call.reject("TextToSpeech engine failed to initialize");
                    }
                    return;
                }

                int lang = tts.setLanguage(Locale.getDefault());
                if (lang == TextToSpeech.LANG_MISSING_DATA || lang == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts.setLanguage(Locale.US);
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    tts.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build());
                }

                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) { }

                    @Override
                    public void onDone(String utteranceId) {
                        runOnUi(() -> onChunkDone(utteranceId, true, null));
                    }

                    @Override
                    @Deprecated
                    public void onError(String utteranceId) {
                        runOnUi(() -> onChunkDone(utteranceId, false, "TextToSpeech error"));
                    }

                    @Override
                    public void onError(String utteranceId, int errorCode) {
                        runOnUi(() -> onChunkDone(utteranceId, false, "TextToSpeech error " + errorCode));
                    }

                    @Override
                    public void onStop(String utteranceId, boolean interrupted) {
                        runOnUi(() -> {
                            if (interrupted) {
                                resolvePendingSpeak();
                            }
                        });
                    }
                });

                List<Runnable> queued = new ArrayList<>(readyQueue);
                readyQueue.clear();
                for (Runnable task : queued) {
                    task.run();
                }
            }));
        });
    }

    private void requestAudioFocus() {
        if (audioManager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build())
                    .setOnAudioFocusChangeListener(focusChange -> { })
                    .build();
                audioManager.requestAudioFocus(focusRequest);
            } else {
                audioManager.requestAudioFocus(
                    focusChange -> { },
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                );
            }
            // Leave communication mode so TTS is audible after mic use.
            audioManager.setMode(AudioManager.MODE_NORMAL);
        } catch (Exception ignored) { }
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                audioManager.abandonAudioFocusRequest(focusRequest);
            } else {
                audioManager.abandonAudioFocus(focusChange -> { });
            }
        } catch (Exception ignored) { }
    }

    private void resolvePendingSpeak() {
        PluginCall speakCall = pendingSpeakCall;
        pendingSpeakCall = null;
        activeUtteranceId = null;
        speakChunks.clear();
        speakChunkIndex = 0;
        abandonAudioFocus();
        if (speakCall != null) {
            speakCall.resolve();
        }
    }

    private void rejectPendingSpeak(String error) {
        PluginCall speakCall = pendingSpeakCall;
        pendingSpeakCall = null;
        activeUtteranceId = null;
        speakChunks.clear();
        speakChunkIndex = 0;
        abandonAudioFocus();
        if (speakCall != null) {
            speakCall.reject(error != null ? error : "TextToSpeech error");
        }
    }

    private void onChunkDone(String utteranceId, boolean ok, String error) {
        if (activeUtteranceId == null || !activeUtteranceId.equals(utteranceId)) {
            return;
        }
        if (!ok) {
            rejectPendingSpeak(error);
            return;
        }
        speakChunkIndex += 1;
        if (speakChunkIndex >= speakChunks.size()) {
            resolvePendingSpeak();
            return;
        }
        speakNextChunk();
    }

    private List<String> chunkText(String text) {
        List<String> chunks = new ArrayList<>();
        String remaining = text.trim();
        while (!remaining.isEmpty()) {
            if (remaining.length() <= MAX_CHUNK) {
                chunks.add(remaining);
                break;
            }
            int split = remaining.lastIndexOf(' ', MAX_CHUNK);
            if (split < MAX_CHUNK / 2) split = MAX_CHUNK;
            chunks.add(remaining.substring(0, split).trim());
            remaining = remaining.substring(split).trim();
        }
        return chunks;
    }

    private void speakNextChunk() {
        if (tts == null || !ready || speakChunkIndex >= speakChunks.size()) {
            resolvePendingSpeak();
            return;
        }
        String chunk = speakChunks.get(speakChunkIndex);
        String utteranceId = UUID.randomUUID().toString();
        activeUtteranceId = utteranceId;

        tts.setSpeechRate(Math.max(0.5f, Math.min(pendingRate, 1.5f)));
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, Math.max(0f, Math.min(pendingVolume, 1f)));
        params.putString(TextToSpeech.Engine.KEY_PARAM_STREAM, String.valueOf(AudioManager.STREAM_MUSIC));

        int result = tts.speak(chunk, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
        if (result != TextToSpeech.SUCCESS) {
            rejectPendingSpeak("TextToSpeech speak() failed");
        }
    }

    @PluginMethod
    public void warmUp(PluginCall call) {
        ensureTts(() -> call.resolve(), call);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) {
            call.resolve();
            return;
        }

        pendingRate = call.getFloat("rate", 1.0f);
        pendingVolume = call.getFloat("volume", 1.0f);
        call.setKeepAlive(true);

        ensureTts(() -> {
            if (!ready || tts == null) {
                call.reject("TextToSpeech not ready");
                return;
            }

            if (pendingSpeakCall != null) {
                resolvePendingSpeak();
            }
            tts.stop();

            speakChunks.clear();
            speakChunks.addAll(chunkText(text));
            speakChunkIndex = 0;
            pendingSpeakCall = call;
            requestAudioFocus();
            speakNextChunk();
        }, call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        runOnUi(() -> {
            if (tts != null) {
                tts.stop();
            }
            resolvePendingSpeak();
            call.resolve();
        });
    }

    @PluginMethod
    public void isSpeaking(PluginCall call) {
        JSObject result = new JSObject();
        boolean speaking = tts != null && tts.isSpeaking();
        result.put("speaking", speaking);
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        runOnUi(() -> {
            if (tts != null) {
                tts.stop();
                tts.shutdown();
                tts = null;
                ready = false;
            }
            abandonAudioFocus();
        });
        super.handleOnDestroy();
    }
}
