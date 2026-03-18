import "./@types/window.d";
import type { NextPage } from "next";
import styles from "../styles/Home.module.scss";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  Button,
  MenuItem,
  Select,
  SelectChangeEvent,
  Slider,
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  Divider,
  LinearProgress,
} from "@mui/material";
import {
  FiberManualRecord,
  LibraryMusic,
  PhotoLibrary,
  VideoLibrary,
  ExpandMore,
  DeleteSweep,
  Warning,
} from "@mui/icons-material";
import { CustomSnackbar } from "../components/CustomSnackbar";
import { drawBars, clearImageCache, getFPS, stopCanvas2DAnimation } from "../lib/Canvas";
import { drawBarsWebGL, getFPSWebGL, cleanupWebGL, stopWebGLAnimation, clearWebGLImageCache } from "../lib/WebGLRenderer";
import type { EffectType, EffectDensity } from "../lib/Effects";
import { getGpuInfo, getGpuDisplayName, getRecommendedRenderer, type GpuInfo } from "../lib/GpuDetector";
import { isWebCodecsSupported, checkHardwareEncoderSupport, getBestEncodingMethod } from "../lib/WebCodecsEncoder";
import { generateMp4Video } from "../lib/Ffmpeg";

const hasWindow = () => {
  return typeof window === "object";
};

const Home: NextPage = () => {
  // クライアントサイドのみ
  if (hasWindow()) {
    // ブラウザによって異なる関数名を定義
    window.requestAnimationFrame =
      window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame;
    window.AudioContext =
      window.AudioContext ||
      window.webkitAudioContext ||
      window.mozAudioContext;

    // 離脱ガード
    window.addEventListener("beforeunload", (e) => {
      e.preventDefault();
      e.returnValue = "作成した動画は保存されませんが、よろしいですか？";
    });
  }

  // UI State
  const [isPlaySound, setIsPlaySound] = useState<boolean>(false);
  const [playSoundDisabled, setPlaySoundDisabled] = useState<boolean>(true);
  const [recordMovieDisabled, setRecordMovieDisabled] = useState<boolean>(true);
  const [imageFileName, setImageFileName] = useState<string>("");
  const [audioFileName, setAudioFileName] = useState<string>("");
  const [fps, setFps] = useState<number>(0);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  // エンコード進捗
  const [encodeStatus, setEncodeStatus] = useState<"idle" | "loading" | "converting">("idle");
  const [encodeProgress, setEncodeProgress] = useState<number>(0);

  // GPU関連State
  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null>(null);
  const [rendererType, setRendererType] = useState<'canvas2d' | 'webgl'>('canvas2d');
  const [webCodecsSupported, setWebCodecsSupported] = useState<boolean>(false);
  const [hardwareEncoderSupport, setHardwareEncoderSupport] = useState<{
    h264: boolean;
    h265: boolean;
    vp9: boolean;
    av1: boolean;
  }>({ h264: false, h265: false, vp9: false, av1: false });

  // Audio State
  const audioCtxRef = useRef<AudioContext>(null);
  const streamDestinationRef = useRef<MediaStreamAudioDestinationNode>(null);
  const analyserRef = useRef<AnalyserNode>(null);
  useEffect(() => {
    // AudioContext
    audioCtxRef.current = new AudioContext();

    // AnalyserNode
    const analyserNode = audioCtxRef.current.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserRef.current = analyserNode;

    // MediaStreamAudioDestinationNode(動画出力用)
    const steamDest = audioCtxRef.current.createMediaStreamDestination();
    streamDestinationRef.current = steamDest;
  }, []);
  const audioBufferSrcRef = useRef<AudioBufferSourceNode>(null);
  const decodedAudioBufferRef = useRef<AudioBuffer>(null);
  const videoElementRef = useRef<HTMLVideoElement>(null);
  const mediaElementSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const setAudioBufferSourceNode = () => {
    // 動画ファイルの場合はMediaElementAudioSourceNodeを使用（既に接続済み）
    if (videoElementRef.current) {
      const video = videoElementRef.current;
      if (!video.paused) {
        video.pause();
      }
      video.currentTime = 0;
      return;
    }
    
    // 通常の音声ファイルの場合
    if (!decodedAudioBufferRef.current) {
      return;
    }
    
    // AudioBufferSourceNode作成
    const audioBufferSourceNode = audioCtxRef.current.createBufferSource();
    audioBufferSourceNode.buffer = decodedAudioBufferRef.current;
    audioBufferSourceNode.loop = false;
    // 再生終了時にプレビューを停止
    audioBufferSourceNode.onended = () => {
      setIsPlaySound(false);
      stopCanvas2DAnimation();
      stopWebGLAnimation();
    };
    // Node接続
    audioBufferSourceNode.connect(analyserRef.current);
    analyserRef.current.connect(audioCtxRef.current.destination);
    analyserRef.current.connect(streamDestinationRef.current);
    audioBufferSrcRef.current = audioBufferSourceNode;
  };

  // 開発者モードフラグ（環境変数で制御）
  const isDeveloperMode =
    process.env.NEXT_PUBLIC_DEVELOPER_MODE === "true" ||
    process.env.NEXT_PUBLIC_DEV_MODE === "true";

  // Mode（セッション用、エクスポート対象外）
  // 初期値は固定でハイドレーション一致（localStorageはuseEffectで読み込み）
  const [mode, setMode] = useState<number>(0);

  // Canvas Size（セッション用、エクスポート対象外）
  type CanvasSize = "1920x1080" | "1080x1920" | "1920x1920";
  const [canvasSize, setCanvasSize] = useState<CanvasSize>("1920x1080");
  
  // Mode adjustment parameters
  // offsetX, offsetYはパーセンテージ（-150%〜150%）
  type ModeAdjustments = {
    scaleX: number;
    scaleY: number;
    offsetX: number; // パーセンテージ（-150〜150）
    offsetY: number; // パーセンテージ（-150〜150）
  };
  const [modeAdjustments, setModeAdjustments] = useState<ModeAdjustments>({
    scaleX: 1.0,
    scaleY: 1.0,
    offsetX: 0, // パーセンテージ
    offsetY: 0, // パーセンテージ
  });

  // エフェクト（共通設定: 選択中エフェクト + 各エフェクトごとの強度）
  const EFFECT_TYPES_WITH_STRENGTH: EffectType[] = ["space", "spaceConstant", "spaceAudio", "vignette", "rainbow", "curtain"];
  const defaultEffectDensities = (): Partial<Record<EffectType, EffectDensity>> => {
    const o: Partial<Record<EffectType, EffectDensity>> = {};
    EFFECT_TYPES_WITH_STRENGTH.forEach((t) => { o[t] = 2; });
    return o;
  };
  const [effectType, setEffectType] = useState<EffectType>("none");
  const [effectDensities, setEffectDensities] = useState<Partial<Record<EffectType, EffectDensity>>>(defaultEffectDensities());
  const effectDensity = (effectType === "none" ? 2 : (effectDensities[effectType] ?? 2)) as EffectDensity;

  // スペクトラム調整
  const [spectrumOpacity, setSpectrumOpacity] = useState<number>(0.9);      // 0.1〜1.0
  const [spectrumFps, setSpectrumFps] = useState<number>(30);               // 1〜60
  const [lineWidthWaveform, setLineWidthWaveform] = useState<number>(3.2);  // mode1
  const [lineWidthCircle, setLineWidthCircle] = useState<number>(3.2);      // mode2
  const [lineWidthSymWave, setLineWidthSymWave] = useState<number>(3.6);    // mode5

  // 音量設定（共通設定: 目標LUFS、null=正規化なし）
  const [targetLufs, setTargetLufs] = useState<number | null>(null);
  const [targetLufsCustom, setTargetLufsCustom] = useState<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (targetLufs != null) localStorage.setItem("common_targetLufs", String(targetLufs));
    else localStorage.removeItem("common_targetLufs");
  }, [targetLufs]);

  // 共通設定の保存（音量・エフェクト種類・各エフェクト強度）
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("common_effectType", effectType);
    localStorage.setItem("common_effectDensities", JSON.stringify(effectDensities));
  }, [effectType, effectDensities]);

  // セッション用: モード・解像度（エクスポート対象外）
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("session_mode", String(mode));
    localStorage.setItem("session_canvasSize", canvasSize);
  }, [mode, canvasSize]);

  // レイアウト別スペアナ設定のキー（縦/横/正方形 × モード）
  const LAYOUTS: CanvasSize[] = ["1920x1080", "1080x1920", "1920x1920"];
  const getSettingsKey = (layout: CanvasSize, m: number) => {
    return `spectrumSettings_${layout}_${m}`;
  };

  // レイアウト×モードの設定を保存
  const saveSettings = (layout: CanvasSize, m: number, adjustments: ModeAdjustments) => {
    try {
      const key = getSettingsKey(layout, m);
      localStorage.setItem(key, JSON.stringify(adjustments));
    } catch (error) {
      console.error("設定の保存に失敗しました:", error);
    }
  };

  // レイアウト×モードの設定を読み込み
  const loadSettings = (layout: CanvasSize, m: number): ModeAdjustments | null => {
    try {
      const key = getSettingsKey(layout, m);
      const saved = localStorage.getItem(key);
      if (saved) {
        return JSON.parse(saved);
      }
      // 旧形式のキー（mode_size）にも対応
      const legacyKey = `spectrumSettings_${m}_${layout}`;
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        localStorage.setItem(key, legacy);
        localStorage.removeItem(legacyKey);
        return parsed;
      }
    } catch (error) {
      console.error("設定の読み込みに失敗しました:", error);
    }
    return null;
  };

  const DEFAULT_ADJUSTMENTS: ModeAdjustments = { scaleX: 1.0, scaleY: 1.0, offsetX: 0, offsetY: 0 };

  // 全設定を一括エクスポート（共通 + 全レイアウト×全モード）
  const exportAllSettings = (): string => {
    const spectrumSettings: Record<string, Record<string, ModeAdjustments>> = {};
    LAYOUTS.forEach((layout) => {
      const layoutData: Record<string, ModeAdjustments> = {};
      [0, 1, 2, 3, 4, 5, 6].forEach((m) => {
        const loaded = loadSettings(layout, m);
        layoutData[String(m)] = loaded ?? DEFAULT_ADJUSTMENTS;
      });
      spectrumSettings[layout] = layoutData;
    });
    const output = {
      common: {
        targetLufs,
        effectType,
        effectDensities,
      },
      spectrumSettings,
    };
    return JSON.stringify(output, null, 2);
  };

  // 全設定をクリア（インポート前の一括リセット用）
  const clearAllSettings = () => {
    LAYOUTS.forEach((layout) => {
      [0, 1, 2, 3, 4, 5, 6].forEach((m) => localStorage.removeItem(getSettingsKey(layout, m)));
    });
    ["common_targetLufs", "common_effectType", "common_effectDensities"].forEach((k) => localStorage.removeItem(k));
  };

  // 存在する項目のみ上書きインポート
  const importAllSettings = (jsonString: string): boolean => {
    try {
      const data = JSON.parse(jsonString);

      // 新形式: common（存在する項目のみ上書き）
      if (data.common) {
        const c = data.common;
        if (c.targetLufs !== undefined) {
          if (c.targetLufs === null) {
            localStorage.removeItem("common_targetLufs");
            setTargetLufs(null);
            setTargetLufsCustom("");
          } else {
            const v = Number(c.targetLufs);
            localStorage.setItem("common_targetLufs", String(v));
            setTargetLufs(v);
            setTargetLufsCustom(v === -14 || v === -15 ? "" : String(v));
          }
        }
        if (c.effectType && ["none", "space", "spaceConstant", "spaceAudio", "vignette", "rainbow", "curtain"].includes(c.effectType)) {
          localStorage.setItem("common_effectType", c.effectType);
          setEffectType(c.effectType);
        }
        if (c.effectDensities && typeof c.effectDensities === "object") {
          const merged = { ...effectDensities };
          EFFECT_TYPES_WITH_STRENGTH.forEach((t) => {
            if (c.effectDensities[t] === 1 || c.effectDensities[t] === 2 || c.effectDensities[t] === 3) {
              merged[t] = c.effectDensities[t];
            }
          });
          localStorage.setItem("common_effectDensities", JSON.stringify(merged));
          setEffectDensities(merged);
        }
      }

      // レイアウト別スペアナ設定
      if (data.spectrumSettings && typeof data.spectrumSettings === "object") {
        LAYOUTS.forEach((layout) => {
          const layoutData = data.spectrumSettings[layout];
          if (layoutData && typeof layoutData === "object") {
            Object.keys(layoutData).forEach((mStr) => {
              const m = parseInt(mStr, 10);
              if (!isNaN(m) && m >= 0 && m <= 6 && layoutData[mStr]) {
                const adj = layoutData[mStr];
                if (adj && typeof adj.scaleX === "number" && typeof adj.scaleY === "number" && typeof adj.offsetX === "number" && typeof adj.offsetY === "number") {
                  saveSettings(layout, m, adj);
                }
              }
            });
          }
        });
      }

      // 旧形式: appSettings + spectrumSettings_* の互換
      if (data.appSettings) {
        const as = data.appSettings;
        if (as.targetLufs !== undefined) {
          if (as.targetLufs === null) {
            setTargetLufs(null);
            setTargetLufsCustom("");
          } else {
            const v = Number(as.targetLufs);
            setTargetLufs(v);
            setTargetLufsCustom(v === -14 || v === -15 ? "" : String(v));
          }
        }
        if (as.effectType) setEffectType(as.effectType);
        if (as.effectDensities) {
          setEffectDensities((prev) => {
            const merged = { ...prev };
            EFFECT_TYPES_WITH_STRENGTH.forEach((t) => {
              if (as.effectDensities[t] === 1 || as.effectDensities[t] === 2 || as.effectDensities[t] === 3) {
                merged[t] = as.effectDensities[t];
              }
            });
            return merged;
          });
        } else if (as.effectDensity != null && as.effectType) {
          setEffectDensities((prev) => ({ ...prev, [as.effectType]: as.effectDensity }));
        }
      }
      // 旧形式 spectrumSettings_{mode}_{layout} または spectrumSettings_{layout}_{mode} の互換
      Object.keys(data).forEach((key) => {
        if (key.startsWith("spectrumSettings_") && key !== "spectrumSettings") {
          const val = data[key];
          if (val && typeof val === "object" && val.scaleX != null && val.scaleY != null && val.offsetX != null && val.offsetY != null) {
            const rest = key.replace("spectrumSettings_", "");
            const parts = rest.split("_");
            if (parts.length === 2) {
              const a = parts[0];
              const b = parts[1];
              const aIsLayout = LAYOUTS.includes(a as CanvasSize);
              const bIsLayout = LAYOUTS.includes(b as CanvasSize);
              const aIsMode = /^\d+$/.test(a);
              const bIsMode = /^\d+$/.test(b);
              if (aIsMode && bIsLayout) {
                saveSettings(b as CanvasSize, parseInt(a, 10), val);
              } else if (aIsLayout && bIsMode) {
                saveSettings(a as CanvasSize, parseInt(b, 10), val);
              }
            }
          }
        }
      });

      const loaded = loadSettings(canvasSize, mode);
      setModeAdjustments(loaded ?? DEFAULT_ADJUSTMENTS);
      return true;
    } catch (error) {
      console.error("設定のインポートに失敗しました:", error);
      return false;
    }
  };

  const handleAdjustmentChange = (key: keyof ModeAdjustments, value: number) => {
    setModeAdjustments((prev) => {
      const newAdjustments = {
        ...prev,
        [key]: value,
      };
      // 設定を自動保存
      saveSettings(canvasSize, mode, newAdjustments);
      return newAdjustments;
    });
  };

  const onChangeMode = (event: SelectChangeEvent<string>) => {
    const newMode = Number(event.target.value);
    saveSettings(canvasSize, mode, modeAdjustments);
    setMode(newMode);
    const loaded = loadSettings(canvasSize, newMode);
    if (loaded) setModeAdjustments(loaded);
  };

  const onChangeCanvasSize = (event: SelectChangeEvent<string>) => {
    const newSize = event.target.value as CanvasSize;
    saveSettings(canvasSize, mode, modeAdjustments);
    setCanvasSize(newSize);
    const loaded = loadSettings(newSize, mode);
    if (loaded) setModeAdjustments(loaded);
  };

  const getCanvasDimensions = (size: CanvasSize): { width: number; height: number } => {
    switch (size) {
      case "1920x1080":
        return { width: 1920, height: 1080 };
      case "1080x1920":
        return { width: 1080, height: 1920 };
      case "1920x1920":
        return { width: 1920, height: 1920 };
      default:
        return { width: 1920, height: 1080 };
    }
  };

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reqIdRef = useRef<number>(null);
  // Canvas用ImageContext
  const [imageCtx, setImageCtx] = useState<HTMLImageElement>(null);

  // マウント後にlocalStorageから設定を読み込み（ハイドレーション一致のためクライアントのみ）
  useEffect(() => {
    const savedMode = localStorage.getItem("session_mode");
    const modeVal = savedMode ? parseInt(savedMode, 10) : 0;
    setMode(modeVal);

    const savedSize = localStorage.getItem("session_canvasSize");
    const sizeVal = (savedSize === "1080x1920" || savedSize === "1920x1920") ? savedSize : "1920x1080";
    setCanvasSize(sizeVal);

    const savedEffectType = localStorage.getItem("common_effectType");
    const valid: EffectType[] = ["none", "space", "spaceConstant", "spaceAudio", "vignette", "rainbow", "curtain"];
    if (savedEffectType && valid.includes(savedEffectType as EffectType)) {
      setEffectType(savedEffectType as EffectType);
    }

    try {
      const savedDensities = localStorage.getItem("common_effectDensities");
      if (savedDensities) {
        const parsed = JSON.parse(savedDensities) as Partial<Record<EffectType, EffectDensity>>;
        const result = defaultEffectDensities();
        EFFECT_TYPES_WITH_STRENGTH.forEach((t) => {
          if (parsed[t] === 1 || parsed[t] === 2 || parsed[t] === 3) result[t] = parsed[t];
        });
        setEffectDensities(result);
      }
    } catch (_e) { /* ignore */ }

    const savedLufs = localStorage.getItem("common_targetLufs");
    if (savedLufs) {
      const n = parseFloat(savedLufs);
      setTargetLufs(n);
      setTargetLufsCustom(n !== -14 && n !== -15 ? String(n) : "");
    }

    const adj = loadSettings(sizeVal as CanvasSize, modeVal);
    if (adj) setModeAdjustments(adj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GPU情報を取得して推奨レンダラーを設定
  useEffect(() => {
    const initGpu = async () => {
      const info = getGpuInfo();
      setGpuInfo(info);

      // 推奨レンダラーを設定
      const recommended = getRecommendedRenderer(info);
      setRendererType(recommended);

      // WebCodecsサポート確認
      const webCodecsAvailable = isWebCodecsSupported();
      setWebCodecsSupported(webCodecsAvailable);

      if (webCodecsAvailable) {
        const encoderSupport = await checkHardwareEncoderSupport();
        setHardwareEncoderSupport(encoderSupport);
      }
    };

    initGpu();
  }, []);

  // Canvas サイズ設定（canvasSize または rendererType が変更されたときに実行）
  // useLayoutEffectを使用してDOM更新直後にサイズを設定
  useLayoutEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const dimensions = getCanvasDimensions(canvasSize);
    canvasRef.current.width = dimensions.width;
    canvasRef.current.height = dimensions.height;

    // キャンバスサイズ変更時に画像キャッシュをクリア（両方のレンダラー）
    clearImageCache();
    clearWebGLImageCache();
  }, [canvasSize, rendererType]);

  // Canvas Animation
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    // 前のアニメーションを停止
    // 描画を完全に停止・クリア
    stopCanvas2DAnimation();
    stopWebGLAnimation();

    // レンダラータイプに応じて描画関数を選択
    const effect = effectType !== "none" ? { type: effectType, density: effectDensity } : undefined;
    const isEffectActive = isPlaySound || isRecording;
    const spectrumSettings = {
      opacity: spectrumOpacity,
      fps: spectrumFps,
      lineWidthWaveform,
      lineWidthCircle,
      lineWidthSymWave,
    };

    if (rendererType === 'webgl') {
      drawBarsWebGL(
        canvasRef.current,
        imageCtx,
        mode,
        analyserRef.current,
        modeAdjustments,
        effect,
        isEffectActive,
        spectrumSettings
      );
    } else {
      drawBars(
        canvasRef.current,
        imageCtx,
        mode,
        analyserRef.current,
        modeAdjustments,
        effect,
        isEffectActive,
        spectrumSettings
      );
    }

    return () => {
      stopCanvas2DAnimation();
      stopWebGLAnimation();
    };
  }, [imageCtx, mode, modeAdjustments, rendererType, effectType, effectDensity, isPlaySound, isRecording]);

  // FPS表示更新（1秒ごとに更新）
  useEffect(() => {
    const fpsInterval = setInterval(() => {
      // レンダラータイプに応じてFPSを取得
      if (rendererType === 'webgl') {
        setFps(getFPSWebGL());
      } else {
        setFps(getFPS());
      }
    }, 1000);
    return () => clearInterval(fpsInterval);
  }, [rendererType]);

  // ファイル拡張子判定ヘルパー
  const isImageFile = (filename: string): boolean => {
    const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
    return imageExts.includes(ext);
  };

  const isAudioFile = (filename: string): boolean => {
    const audioExts = [".mp3", ".wav", ".ogg", ".aac", ".m4a", ".flac", ".wma"];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
    return audioExts.includes(ext);
  };

  const isVideoFile = (filename: string): boolean => {
    const videoExts = [".mp4", ".webm", ".mov", ".avi", ".mkv"];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
    return videoExts.includes(ext);
  };

  // 画像読み込み処理（共通）
  const loadImageFile = (file: File) => {
    const image = new Image();
    image.onload = () => {
      if (!canvasRef.current) {
        return;
      }
      setImageCtx(image);
      setImageFileName(file.name);
      openSnackBar("画像を読み込みました");
    };
    image.onerror = (e) => {
      console.error("画像の読み込みに失敗しました:", e);
      openSnackBar("画像の読み込みに失敗しました");
    };
    image.src = URL.createObjectURL(file);
  };

  // 音楽読み込み処理（共通）
  const loadAudioFile = async (file: File) => {
    try {
      const arraybuffer = await file.arrayBuffer();
      decodedAudioBufferRef.current = await audioCtxRef.current.decodeAudioData(
        arraybuffer
      );
      setPlaySoundDisabled(false);
      setRecordMovieDisabled(false);
      setAudioFileName(file.name);
      openSnackBar("音楽を読み込みました");
    } catch (error) {
      openSnackBar("音楽の読み込みに失敗しました: " + error);
    }
  };

  // 画像ボタンから読み込み
  const imageLoad = (event: { target: HTMLInputElement }) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    // MP4ファイルの場合、静止画として扱う（ビデオの最初のフレームを抽出する必要があるが、簡易的に画像として扱う）
    if (isVideoFile(file.name)) {
      // MP4を画像として扱う場合、HTMLVideoElementを使用してフレームを抽出
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        video.currentTime = 0.1; // 最初のフレームを取得
      };
      video.onloadeddata = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const image = new Image();
          image.onload = () => {
            if (!canvasRef.current) {
              return;
            }
            setImageCtx(image);
            setImageFileName(file.name);
            openSnackBar("動画ファイルから静止画を抽出しました");
          };
          image.src = canvas.toDataURL();
        }
      };
      video.src = URL.createObjectURL(file);
      return;
    }
    loadImageFile(file);
  };

  // 音楽ボタンから読み込み
  const audioLoad = async (event: { target: HTMLInputElement }) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    // MP4ファイルの場合、音声として扱う
    if (isVideoFile(file.name)) {
      // MP4の音声トラックを抽出（HTMLVideoElementとMediaElementAudioSourceNodeを使用）
      const video = document.createElement("video");
      video.preload = "auto";
      video.crossOrigin = "anonymous";
      video.src = URL.createObjectURL(file);
      videoElementRef.current = video;
      
      video.onloadedmetadata = () => {
        try {
          // MediaElementAudioSourceNodeを使用して音声を取得
          mediaElementSourceRef.current?.disconnect();
          const source = audioCtxRef.current.createMediaElementSource(video);
          mediaElementSourceRef.current = source;
          source.connect(analyserRef.current);
          analyserRef.current.connect(audioCtxRef.current.destination);
          analyserRef.current.connect(streamDestinationRef.current);
          
          // 再生終了時の処理
          video.onended = () => {
            setIsPlaySound(false);
            stopCanvas2DAnimation();
            stopWebGLAnimation();
          };
          
          setPlaySoundDisabled(false);
          setRecordMovieDisabled(false);
          setAudioFileName(file.name);
          openSnackBar("動画ファイルから音声を読み込みました");
        } catch (error) {
          openSnackBar("動画ファイルの音声読み込みに失敗しました: " + error);
          videoElementRef.current = null;
        }
      };
      video.onerror = () => {
        openSnackBar("動画ファイルの読み込みに失敗しました");
        videoElementRef.current = null;
      };
      return;
    }
    await loadAudioFile(file);
  };

  // ドラッグ&ドロップ処理
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    
    if (files.length === 0) {
      return;
    }

    let imageFile: File | null = null;
    let audioFile: File | null = null;

    // ファイルを分類
    for (const file of files) {
      if (isImageFile(file.name) && !imageFile) {
        imageFile = file;
      } else if (isAudioFile(file.name) && !audioFile) {
        audioFile = file;
      } else if (isVideoFile(file.name)) {
        // MP4の場合は音楽ファイルとして扱う（デフォルト）
        if (!audioFile) {
          audioFile = file;
        }
      }
    }

    // 画像ファイルを読み込み
    if (imageFile) {
      loadImageFile(imageFile);
    }

    // 音楽ファイルを読み込み
    if (audioFile) {
      await loadAudioFile(audioFile);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // PlaySoundEvent
  const onPlaySound = () => {
    if (isPlaySound) {
      if (audioBufferSrcRef.current) {
        audioBufferSrcRef.current.stop(0);
      }
      if (videoElementRef.current) {
        videoElementRef.current.pause();
      }
      stopCanvas2DAnimation();
      stopWebGLAnimation();
      setIsPlaySound(false);
      return;
    }
    setAudioBufferSourceNode();
    
    // 動画ファイルの場合は再生開始
    if (videoElementRef.current) {
      videoElementRef.current.play();
    } else if (audioBufferSrcRef.current) {
      audioBufferSrcRef.current.start(0);
    }
    
    setIsPlaySound(true);
  };
  // RecordMovieEvent
  const onRecordMovie = () => {
    if (!canvasRef.current) {
      openSnackBar("canvasが初期化されていません");
      return;
    }
    
    // 録画開始フラグを先に設定
    setIsRecording(true);
    
    // キャンバスアニメーションを確実に開始（前回ストップで停止している場合に備える）
    const effect = effectType !== "none" ? { type: effectType, density: effectDensity } : undefined;
    const spectrumSettings = {
      opacity: spectrumOpacity,
      fps: spectrumFps,
      lineWidthWaveform,
      lineWidthCircle,
      lineWidthSymWave,
    };
    if (canvasRef.current && analyserRef.current) {
      if (rendererType === "webgl") {
        drawBarsWebGL(
          canvasRef.current,
          imageCtx,
          mode,
          analyserRef.current,
          modeAdjustments,
          effect,
          true,  // 録画開始時はエフェクトを有効
          spectrumSettings
        );
      } else {
        drawBars(
          canvasRef.current,
          imageCtx,
          mode,
          analyserRef.current,
          modeAdjustments,
          effect,
          true,  // 録画開始時はエフェクトを有効
          spectrumSettings
        );
      }
    }
    
    // 録画用canvasのアニメーションが開始されるまで少し待つ
    setTimeout(() => {
      const audioStream = streamDestinationRef.current.stream;
      const canvasStream = canvasRef.current.captureStream();
      const outputStream = new MediaStream();
      [audioStream, canvasStream].forEach((stream) => {
        stream.getTracks().forEach(function (track: MediaStreamTrack) {
          outputStream.addTrack(track);
        });
      });
      //ストリームからMediaRecorderを生成
      const recorder = new MediaRecorder(outputStream, {
        mimeType: "video/webm;codecs=h264",
      });
      const recordedBlobs: Blob[] = [];
      recorder.addEventListener("dataavailable", (e) => {
        recordedBlobs.push(e.data);
      });
      //録画終了時に動画ファイルのダウンロードリンクを生成する処理
      recorder.addEventListener("stop", async () => {
        setIsRecording(false);
        const movieName = "movie_" + Math.random().toString(36).slice(-8);
        const webmName = movieName + ".webm";
        const mp4Name = movieName + ".mp4";

        try {
          setEncodeStatus("loading");
          setEncodeProgress(0);
          const webmBlob = new Blob(recordedBlobs, { type: "video/webm" });
          const binaryData = new Uint8Array(await webmBlob.arrayBuffer());
          const video = await generateMp4Video(binaryData, webmName, mp4Name, {
            onLoadStart: () => setEncodeStatus("loading"),
            onLoadComplete: () => {
              setEncodeStatus("converting");
              setEncodeProgress(0);
            },
            onProgress: (ratio) => setEncodeProgress(Math.round(ratio * 100)),
          }, targetLufs);
          setEncodeStatus("idle");
          const mp4Blob = new Blob([video], { type: "video/mp4" });
          const objectURL = URL.createObjectURL(mp4Blob);

          const a = document.createElement("a");
          a.href = objectURL;
          a.download = mp4Name;
          a.click();
          a.remove();
          openSnackBar("動画の変換が完了しました！");
        } catch (error) {
          openSnackBar("動画の変換に失敗しました: " + (error as Error).message);
          setEncodeStatus("idle");
        } finally {
          setRecordMovieDisabled(false);
        }
      });
      recorder.start();
      openSnackBar("動画を録画しています...");
      onPlaySound();
      setRecordMovieDisabled(true);
      
      // 再生終了時の処理
      if (videoElementRef.current) {
        const originalOnEnded = videoElementRef.current.onended;
        videoElementRef.current.onended = () => {
          if (originalOnEnded) {
            originalOnEnded.call(videoElementRef.current);
          }
          recorder.stop();
          setIsRecording(false);
          setIsPlaySound(false);
        };
      } else if (audioBufferSrcRef.current) {
        audioBufferSrcRef.current.onended = () => {
          recorder.stop();
          setIsRecording(false);
          setIsPlaySound(false);
        };
      }
    }, 100); // 100ms待機して録画用canvasのアニメーション開始を保証
  };

  // SnackBar
  const [snackBarProps, setSnackBarProps] = useState({
    isOpen: false,
    message: "",
  });
  const openSnackBar = (message: string) => {
    setSnackBarProps({ isOpen: true, message });
  };
  const handleClose = (
    _event?: React.SyntheticEvent | Event,
    reason?: string
  ) => {
    if (reason === "clickaway") {
      return;
    }
    setSnackBarProps({ isOpen: false, message: snackBarProps.message });
  };

  // クリア（ページロード時の状態に戻す）
  const onClear = () => {
    // 再生停止
    if (audioBufferSrcRef.current) {
      try {
        audioBufferSrcRef.current.stop(0);
      } catch {}
      audioBufferSrcRef.current = null;
    }
    if (videoElementRef.current) {
      videoElementRef.current.pause();
      if (videoElementRef.current.src?.startsWith("blob:")) {
        URL.revokeObjectURL(videoElementRef.current.src);
      }
      videoElementRef.current.src = "";
      videoElementRef.current = null;
    }
    mediaElementSourceRef.current?.disconnect();
    mediaElementSourceRef.current = null;
    // 描画を完全停止し、キャンバスを背景だけの状態にクリア
    stopCanvas2DAnimation();
    stopWebGLAnimation();
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "rgba(34, 34, 34, 1.0)";
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    clearImageCache();
    clearWebGLImageCache();
    if (imageCtx?.src?.startsWith("blob:")) {
      URL.revokeObjectURL(imageCtx.src);
    }
    setImageCtx(null);
    setImageFileName("");
    setAudioFileName("");
    decodedAudioBufferRef.current = null;
    setIsPlaySound(false);
    setPlaySoundDisabled(true);
    setRecordMovieDisabled(true);
    setIsRecording(false);
    setEncodeStatus("idle");
    setEncodeProgress(0);
    setMode(0);
    setCanvasSize("1920x1080");
    setModeAdjustments({
      scaleX: 1.0,
      scaleY: 1.0,
      offsetX: 0,
      offsetY: 0,
    });
    setEffectType("none");
    setEffectDensities(defaultEffectDensities());
    setTargetLufs(null);
    setTargetLufsCustom("");
    openSnackBar("クリアしました");
  };

  return (
    <>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 12px", boxSizing: "border-box" }}>
      <main>
        {/* 録画・変換中の注意喚起（スクロール追随）。プログレスバーはその直下に表示 */}
        {(isRecording || encodeStatus !== "idle") && (
          <Box
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 1200,
              boxShadow: 4,
            }}
          >
            <Box
              sx={{
                bgcolor: "error.main",
                color: "error.contrastText",
                px: 2,
                py: 1.5,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
            }}
          >
            <Warning sx={{ fontSize: 28, flexShrink: 0 }} />
              <Typography variant="h6" component="div" sx={{ fontWeight: 700 }}>
                生成中はウィンドウを切り替えたり閉じないでください
              </Typography>
            </Box>
            {encodeStatus !== "idle" && (
              <Box
                sx={{
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  px: 2,
                  py: 1,
                  borderTop: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  {encodeStatus === "loading"
                    ? "FFmpegを読み込み中..."
                    : `MP4変換中... ${encodeProgress}%`}
                </Typography>
                <LinearProgress
                  variant={encodeStatus === "loading" ? "indeterminate" : "determinate"}
                  value={encodeProgress}
                  sx={{
                    height: 6,
                    borderRadius: 1,
                    bgcolor: "rgba(255,255,255,0.3)",
                    "& .MuiLinearProgress-bar": {
                      bgcolor: "white",
                    },
                  }}
                />
              </Box>
            )}
          </Box>
        )}
        <div className={styles.heading}>
          <h1 className={styles.heading__title}>Music Waves Visualizer(改)</h1>
          <div className={styles.heading__text}>
            <p>画像と音楽を読み込んで音声波形動画を作成するWebページです。動画はmp4形式で出力されます。</p>
          </div>
        </div>

        <div
          className={styles.dropZone}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <Typography variant="body2" sx={{ mb: 0.25, fontWeight: 500 }}>
            ファイルをドラッグ&ドロップ（複数ファイル対応）
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, alignItems: "stretch" }}>
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", justifyContent: "center", width: "100%" }}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<PhotoLibrary />}
                size="medium"
                sx={{ flexShrink: 0, minWidth: 210 }}
              >
                画像を選ぶ
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={imageLoad}
                  hidden
                />
              </Button>
              <Typography 
                variant="body2" 
                color="textSecondary" 
                sx={{ 
                  minWidth: 200,
                  maxWidth: "100%",
                  overflow: "hidden", 
                  textOverflow: "ellipsis", 
                  whiteSpace: "nowrap",
                  flex: 1,
                  textAlign: "left"
                }}
              >
                {imageFileName || "未選択"}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", justifyContent: "center", width: "100%" }}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<LibraryMusic />}
                size="medium"
                sx={{ flexShrink: 0, minWidth: 210 }}
              >
                音楽ファイルを選ぶ
                <input
                  type="file"
                  accept="audio/*,video/*"
                  onChange={audioLoad}
                  hidden
                />
              </Button>
              <Typography 
                variant="body2" 
                color="textSecondary" 
                sx={{ 
                  minWidth: 200,
                  maxWidth: "100%",
                  overflow: "hidden", 
                  textOverflow: "ellipsis", 
                  whiteSpace: "nowrap",
                  flex: 1,
                  textAlign: "left"
                }}
              >
                {audioFileName || "未選択"}
              </Typography>
            </Box>
          </Box>
          <Typography variant="caption" color="textSecondary" sx={{ mt: 0, display: "block" }}>
            画像ファイルと音楽ファイルを自動判定します。MP4は音楽ファイルとして扱われます。
          </Typography>
        </div>

        <div className={styles.menu}>
          <div className={styles.menu__controls}>
            <div className={styles.spectrumButtons}>
              <Typography variant="body2" sx={{ mb: 0, textAlign: "center", fontWeight: 500 }}>
                スペクトラムアナライザー
              </Typography>
              <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap" }}>
                {[
                  { value: -1, label: "OFF" },
                  { value: 0, label: "周波数バー" },
                  { value: 1, label: "折れ線" },
                  { value: 2, label: "円形" },
                  { value: 3, label: "上下対称バー" },
                  { value: 4, label: "ドット表示" },
                  { value: 5, label: "波形（上下対称）" },
                  { value: 6, label: "3D風バー" },
                ].map((item) => (
                  <Button
                    key={item.value}
                    variant={mode === item.value ? "contained" : "outlined"}
                    onClick={() => onChangeMode({ target: { value: item.value.toString() } } as SelectChangeEvent<string>)}
                    size="small"
                  >
                    {item.label}
                  </Button>
                ))}
              </Box>
            </div>
            <div className={styles.resolutionButtons}>
              <Typography variant="body2" sx={{ mb: 0, textAlign: "center", fontWeight: 500 }}>
                解像度
              </Typography>
              <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap" }}>
                <Button
                  variant={canvasSize === "1920x1080" ? "contained" : "outlined"}
                  onClick={() => onChangeCanvasSize({ target: { value: "1920x1080" } } as SelectChangeEvent<string>)}
                  size="small"
                >
                  横長 1920×1080 (16:9)
                </Button>
                <Button
                  variant={canvasSize === "1080x1920" ? "contained" : "outlined"}
                  onClick={() => onChangeCanvasSize({ target: { value: "1080x1920" } } as SelectChangeEvent<string>)}
                  size="small"
                >
                  縦長 1080×1920 (9:16)
                </Button>
                <Button
                  variant={canvasSize === "1920x1920" ? "contained" : "outlined"}
                  onClick={() => onChangeCanvasSize({ target: { value: "1920x1920" } } as SelectChangeEvent<string>)}
                  size="small"
                >
                  正方形 1920×1920 (1:1)
                </Button>
              </Box>
            </div>
            <div className={styles.effectButtons}>
              <Typography variant="body2" sx={{ mb: 0, textAlign: "center", fontWeight: 500 }}>
                エフェクト
              </Typography>
              <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
                <Button
                  variant={effectType === "none" ? "contained" : "outlined"}
                  onClick={() => setEffectType("none")}
                  size="small"
                >
                  OFF
                </Button>
                <Button
                  variant={effectType === "space" ? "contained" : "outlined"}
                  onClick={() => setEffectType("space")}
                  size="small"
                >
                  宇宙空間
                </Button>
                <Button
                  variant={effectType === "spaceConstant" ? "contained" : "outlined"}
                  onClick={() => setEffectType("spaceConstant")}
                  size="small"
                >
                  宇宙空間（等速）
                </Button>
                <Button
                  variant={effectType === "spaceAudio" ? "contained" : "outlined"}
                  onClick={() => setEffectType("spaceAudio")}
                  size="small"
                >
                  宇宙空間（音源連動）
                </Button>
                <Button
                  variant={effectType === "vignette" ? "contained" : "outlined"}
                  onClick={() => setEffectType("vignette")}
                  size="small"
                >
                  ビネット
                </Button>
                <Button
                  variant={effectType === "rainbow" ? "contained" : "outlined"}
                  onClick={() => setEffectType("rainbow")}
                  size="small"
                >
                  レインボー
                </Button>
                <Button
                  variant={effectType === "curtain" ? "contained" : "outlined"}
                  onClick={() => setEffectType("curtain")}
                  size="small"
                >
                  カーテン
                </Button>
                {effectType !== "none" && (
                  <>
                    <Typography variant="caption" color="textSecondary" sx={{ mx: 0.5 }}>
                      強度:
                    </Typography>
                    {([1, 2, 3] as EffectDensity[]).map((d) => (
                      <Button
                        key={d}
                        variant={effectDensity === d ? "contained" : "outlined"}
                        onClick={() => setEffectDensities((prev) => ({ ...prev, [effectType]: d }))}
                        size="small"
                      >
                        {d === 1 ? "弱" : d === 2 ? "中" : "強"}
                      </Button>
                    ))}
                  </>
                )}
              </Box>
            </div>
          </div>
        </div>

        {isDeveloperMode && (
          <div className={styles.developerPanel}>
            <Box sx={{ mb: 2, p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
              <Typography variant="body2" color="textSecondary">
                FPS: <strong style={{ color: fps >= 55 ? '#4caf50' : fps >= 30 ? '#ff9800' : '#f44336' }}>{fps}</strong>
              </Typography>
            </Box>
          </div>
        )}

        <div className={styles.adjustments}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography>表示・音量設定</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ width: "100%", maxWidth: 600, margin: "0 auto" }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                  音量設定（目標LUFS）
                </Typography>
                <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                  動画サイトの推奨値に合わせて音量を正規化します。MP4変換時に適用されます。
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 3 }}>
                  <Button
                    variant={targetLufs === null ? "contained" : "outlined"}
                    size="small"
                    onClick={() => { setTargetLufs(null); setTargetLufsCustom(""); }}
                  >
                    なし
                  </Button>
                  <Button
                    variant={targetLufs === -14 ? "contained" : "outlined"}
                    size="small"
                    onClick={() => { setTargetLufs(-14); setTargetLufsCustom("-14"); }}
                    sx={{ textTransform: "none" }}
                  >
                    YouTube等 (-14 LUFS)
                  </Button>
                  <Button
                    variant={targetLufs === -15 ? "contained" : "outlined"}
                    size="small"
                    onClick={() => { setTargetLufs(-15); setTargetLufsCustom("-15"); }}
                    sx={{ textTransform: "none" }}
                  >
                    ニコニコ動画 (-15 LUFS)
                  </Button>
                  <TextField
                    size="small"
                    label="手動入力 (dB)"
                    type="number"
                    value={targetLufsCustom}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTargetLufsCustom(v);
                      const n = parseFloat(v);
                      if (v === "") {
                        setTargetLufs(null);
                      } else if (!isNaN(n) && n < 0 && n > -60) {
                        setTargetLufs(n);
                      }
                    }}
                    placeholder="-14"
                    sx={{ width: 140 }}
                    inputProps={{ min: -60, max: 0, step: 0.5 }}
                  />
                </Box>
                <Divider sx={{ my: 3 }} />

                <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                  スペクトラム調整
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography gutterBottom>透過率: {spectrumOpacity.toFixed(2)}</Typography>
                  <Slider
                    value={spectrumOpacity}
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    onChange={(_, v) => setSpectrumOpacity(v as number)}
                  />
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography gutterBottom>更新レート: {spectrumFps} fps</Typography>
                  <Slider
                    value={spectrumFps}
                    min={1}
                    max={60}
                    step={1}
                    onChange={(_, v) => setSpectrumFps(v as number)}
                  />
                </Box>
                {mode === 1 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography gutterBottom>折れ線の線幅: {lineWidthWaveform.toFixed(1)} px</Typography>
                    <Slider
                      value={lineWidthWaveform}
                      min={1}
                      max={8}
                      step={0.1}
                      onChange={(_, v) => setLineWidthWaveform(v as number)}
                    />
                  </Box>
                )}
                {mode === 2 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography gutterBottom>円形の線幅: {lineWidthCircle.toFixed(1)} px</Typography>
                    <Slider
                      value={lineWidthCircle}
                      min={1}
                      max={8}
                      step={0.1}
                      onChange={(_, v) => setLineWidthCircle(v as number)}
                    />
                  </Box>
                )}
                {mode === 5 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography gutterBottom>波形（上下対称）の線幅: {lineWidthSymWave.toFixed(1)} px</Typography>
                    <Slider
                      value={lineWidthSymWave}
                      min={1}
                      max={8}
                      step={0.1}
                      onChange={(_, v) => setLineWidthSymWave(v as number)}
                    />
                  </Box>
                )}

                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                  表示調整
                </Typography>
                <Typography gutterBottom>横幅倍率: {modeAdjustments.scaleX.toFixed(2)}</Typography>
                <Slider
                  value={modeAdjustments.scaleX}
                  onChange={(_, value) =>
                    handleAdjustmentChange("scaleX", value as number)
                  }
                  min={0.1}
                  max={3.0}
                  step={0.1}
                  marks={[
                    { value: 0.5, label: "0.5" },
                    { value: 1.0, label: "1.0" },
                    { value: 2.0, label: "2.0" },
                  ]}
                />
                <Typography gutterBottom sx={{ mt: 3 }}>
                  縦幅倍率: {modeAdjustments.scaleY.toFixed(2)}
                </Typography>
                <Slider
                  value={modeAdjustments.scaleY}
                  onChange={(_, value) =>
                    handleAdjustmentChange("scaleY", value as number)
                  }
                  min={0.1}
                  max={3.0}
                  step={0.1}
                  marks={[
                    { value: 0.5, label: "0.5" },
                    { value: 1.0, label: "1.0" },
                    { value: 2.0, label: "2.0" },
                  ]}
                />
                <Typography gutterBottom sx={{ mt: 3 }}>
                  横位置: {modeAdjustments.offsetX.toFixed(1)}% (実際:{" "}
                  {Math.round(
                    (getCanvasDimensions(canvasSize).width *
                      modeAdjustments.offsetX) /
                      100
                  )}
                  px)
                </Typography>
                <Slider
                  value={modeAdjustments.offsetX}
                  onChange={(_, value) =>
                    handleAdjustmentChange("offsetX", value as number)
                  }
                  min={-150}
                  max={150}
                  step={1}
                  marks={[
                    { value: -150, label: "-150%" },
                    { value: 0, label: "0%" },
                    { value: 150, label: "150%" },
                  ]}
                />
                <Typography gutterBottom sx={{ mt: 3 }}>
                  縦位置: {modeAdjustments.offsetY.toFixed(1)}% (実際:{" "}
                  {Math.round(
                    (getCanvasDimensions(canvasSize).height *
                      modeAdjustments.offsetY) /
                      100
                  )}
                  px)
                </Typography>
                <Slider
                  value={modeAdjustments.offsetY}
                  onChange={(_, value) =>
                    handleAdjustmentChange("offsetY", value as number)
                  }
                  min={-150}
                  max={150}
                  step={1}
                  marks={[
                    { value: -150, label: "-150%" },
                    { value: 0, label: "0%" },
                    { value: 150, label: "150%" },
                  ]}
                />
              </Box>
            </AccordionDetails>
          </Accordion>
        </div>

        <div className={styles.canvasWrapper}>
          <canvas
            key={rendererType}
            className={styles.canvas}
            ref={canvasRef}
            data-size={canvasSize}
          ></canvas>

          <div className={styles.menu__right}>
            <Box sx={{ display: "flex", gap: 1.5, justifyContent: "center", flexWrap: "wrap", mt: 1 }}>
            <Button
              variant="outlined"
              startIcon={<VideoLibrary />}
              disabled={playSoundDisabled}
              onClick={onPlaySound}
              size="medium"
            >
              {isPlaySound ? "ストップ" : "プレビュー"}
            </Button>
            <Button
              variant="outlined"
              startIcon={<FiberManualRecord />}
              disabled={recordMovieDisabled || isPlaySound}
              onClick={onRecordMovie}
              size="medium"
            >
              動画を生成
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<DeleteSweep />}
              onClick={onClear}
              size="medium"
              sx={{ ml: 2 }}
            >
              クリア
            </Button>
          </Box>
          </div>

          <div className={styles.canvasInfo}>
            <Typography variant="caption" color="textSecondary">
              録画サイズ: {getCanvasDimensions(canvasSize).width}×{getCanvasDimensions(canvasSize).height}px
            </Typography>
          </div>
        </div>
      </main>

      <div className={styles.developerPanel}>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle2" color="primary">
              設定管理
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ width: "100%", maxWidth: 600, margin: "0 auto" }}>
              <Typography variant="body2" gutterBottom>
                現在の設定: モード{mode} × {canvasSize}
              </Typography>
              <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
                エクスポートは全設定を一括出力。インポートは存在する項目のみ上書きします。
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" gutterBottom>
                設定のエクスポート/インポート
              </Typography>
              <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    const json = exportAllSettings();
                    if (json) {
                      const blob = new Blob([json], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `music-waves-visualizer-settings-${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      navigator.clipboard.writeText(json);
                      openSnackBar("全設定をエクスポートしました（ファイル保存・クリップボード）");
                    }
                  }}
                >
                  エクスポート
                </Button>
                <input
                  type="file"
                  accept=".json,application/json"
                  style={{ display: "none" }}
                  id="import-settings-file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        const text = reader.result as string;
                        if (importAllSettings(text)) {
                          const loaded = loadSettings(canvasSize, mode);
                          setModeAdjustments(loaded ?? DEFAULT_ADJUSTMENTS);
                          openSnackBar("設定をインポートしました（存在する項目のみ上書き）");
                        } else {
                          openSnackBar("設定のインポートに失敗しました");
                        }
                      };
                      reader.readAsText(file);
                    }
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outlined"
                  size="small"
                  component="label"
                  htmlFor="import-settings-file"
                >
                  インポート
                </Button>
              </Box>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="設定JSON（貼り付け用）"
                variant="outlined"
                size="small"
                placeholder='{"common": {"targetLufs": -14, "effectType": "space", "effectDensities": {...}}, "spectrumSettings": {"1920x1080": {"0": {...}}}}'
                onChange={(e) => {
                  try {
                    JSON.parse(e.target.value);
                    if (importAllSettings(e.target.value)) {
                      const loaded = loadSettings(canvasSize, mode);
                      setModeAdjustments(loaded ?? DEFAULT_ADJUSTMENTS);
                      openSnackBar("設定を適用しました（存在する項目のみ上書き）");
                    }
                  } catch (err) {
                    // パースエラーは無視（入力中）
                  }
                }}
              />
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: "block" }}>
                すべての設定をクリア:{" "}
                <Button
                  size="small"
                  color="error"
                  onClick={() => {
                    if (confirm("すべての保存された設定を削除しますか？")) {
                      clearAllSettings();
                      setEffectType("none");
                      setEffectDensities(defaultEffectDensities());
                      setTargetLufs(null);
                      setTargetLufsCustom("");
                      setModeAdjustments(DEFAULT_ADJUSTMENTS);
                      openSnackBar("すべての設定を削除しました");
                    }
                  }}
                >
                  クリア
                </Button>
              </Typography>
            </Box>
          </AccordionDetails>
        </Accordion>
      </div>

      {/* GPU設定パネル */}
      <div className={styles.developerPanel}>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle2" color="primary">
              GPU設定
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ width: "100%", maxWidth: 800, margin: "0 auto" }}>
              {/* GPU情報表示 */}
              {gpuInfo && (
                <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                  <Typography variant="h6" gutterBottom>
                    検出されたGPU
                  </Typography>
                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    {getGpuDisplayName(gpuInfo)}
                  </Typography>
                  <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{
                      px: 1,
                      py: 0.5,
                      bgcolor: gpuInfo.isWebGL2Supported ? 'success.main' : 'error.main',
                      color: 'white',
                      borderRadius: 1
                    }}>
                      WebGL2: {gpuInfo.isWebGL2Supported ? '対応' : '非対応'}
                    </Typography>
                    <Typography variant="caption" sx={{
                      px: 1,
                      py: 0.5,
                      bgcolor: gpuInfo.isWebGPUSupported ? 'success.main' : 'warning.main',
                      color: 'white',
                      borderRadius: 1
                    }}>
                      WebGPU: {gpuInfo.isWebGPUSupported ? '対応' : '非対応'}
                    </Typography>
                    <Typography variant="caption" sx={{
                      px: 1,
                      py: 0.5,
                      bgcolor: webCodecsSupported ? 'success.main' : 'warning.main',
                      color: 'white',
                      borderRadius: 1
                    }}>
                      WebCodecs: {webCodecsSupported ? '対応' : '非対応'}
                    </Typography>
                    {webCodecsSupported && hardwareEncoderSupport.h264 && (
                      <Typography variant="caption" sx={{
                        px: 1,
                        py: 0.5,
                        bgcolor: 'info.main',
                        color: 'white',
                        borderRadius: 1
                      }}>
                        H.264ハードウェアエンコード対応
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                    GPUベンダー: {gpuInfo.vendorType === 'nvidia' ? 'NVIDIA' : gpuInfo.vendorType === 'intel' ? 'Intel' : gpuInfo.vendorType === 'amd' ? 'AMD' : gpuInfo.vendorType === 'apple' ? 'Apple' : '不明'}
                  </Typography>
                </Box>
              )}

              {/* レンダラー選択 */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="body1" gutterBottom fontWeight={500}>
                  レンダリングエンジン
                </Typography>
                <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                  WebGLを使用するとGPU加速により高速なレンダリングが可能です
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Button
                    variant={rendererType === 'canvas2d' ? 'contained' : 'outlined'}
                    onClick={() => setRendererType('canvas2d')}
                    size="small"
                  >
                    Canvas 2D (互換性優先)
                  </Button>
                  <Button
                    variant={rendererType === 'webgl' ? 'contained' : 'outlined'}
                    onClick={() => setRendererType('webgl')}
                    size="small"
                    disabled={!gpuInfo?.isWebGLSupported}
                  >
                    WebGL (GPU加速)
                    {gpuInfo && getRecommendedRenderer(gpuInfo) === 'webgl' && ' 🎯推奨'}
                  </Button>
                </Box>
              </Box>
            </Box>
          </AccordionDetails>
        </Accordion>
      </div>

      <CustomSnackbar
        {...snackBarProps}
        handleClose={handleClose}
      ></CustomSnackbar>

      <footer className={styles.footer}>
        <p>
          Original work ©{" "}
          <a
            href="https://tech-blog.voicy.jp/entry/2022/12/11/235929"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.footer__link}
          >
            komura-c
          </a>
          , modified version{" "}
          <a
            href="https://github.com/kuwa2005/music-waves-visualizer"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.footer__link}
          >
            KURAGASHI
          </a>
        </p>
      </footer>
      </div>
    </>
  );
};

export default Home;
