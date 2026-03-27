import "./@types/window.d";
import type { NextPage } from "next";
import styles from "../styles/Home.module.scss";

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import {
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Slider,
  Box,
  Typography,
  TextField,
  Divider,
  LinearProgress,
  Tabs,
  Tab,
} from "@mui/material";
import {
  FiberManualRecord,
  ExpandMore,
  LibraryMusic,
  PhotoLibrary,
  VideoLibrary,
  DeleteSweep,
  Warning,
} from "@mui/icons-material";
import i18n from "i18next";
import { CustomSnackbar } from "../components/CustomSnackbar";
import { drawBars, clearImageCache, getFPS, stopCanvas2DAnimation, GLYCO_COLOR_SETS, GLYCO_GRADIENT_SETS } from "../lib/Canvas";
import { drawBarsWebGL, getFPSWebGL, cleanupWebGL, stopWebGLAnimation, clearWebGLImageCache } from "../lib/WebGLRenderer";
import type { EffectType, EffectDensity, EffectParams } from "../lib/Effects";
import { getGpuInfo, getGpuDisplayName, benchmarkRenderers, type GpuInfo } from "../lib/GpuDetector";
import { isWebCodecsSupported, checkHardwareEncoderSupport, getBestEncodingMethod } from "../lib/WebCodecsEncoder";
import { generateMp4Video } from "../lib/Ffmpeg";
import {
  gateImageFile,
  gateAudioFile,
  gateVideoAsMediaFile,
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES,
  MAX_SETTINGS_JSON_BYTES,
  isImageFileByName,
  isAudioFileByName,
  isVideoFileByName,
  type FileGate,
  isFileGateFailure,
} from "../lib/fileValidation";

type ShortOutputPreset = "all" | "tiktok" | "youtube" | "niconico";
type ResolvedClip = { full: true } | { full: false; start: number; duration: number };
const BASIC_COLOR_PALETTE_16 = [
  "#000000",
  "#ffffff",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#00ffff",
  "#ff00ff",
  "#808080",
  "#800000",
  "#808000",
  "#008000",
  "#800080",
  "#008080",
  "#000080",
  "#ffa500",
] as const;

function normalizeHexColorInput(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  return raw.startsWith("#") ? raw.toUpperCase() : `#${raw.toUpperCase()}`;
}

function isHexColorCode(value: string): boolean {
  return /^#[0-9A-F]{6}$/.test(value);
}

function getShortPlatformMaxSec(p: ShortOutputPreset): number {
  if (p === "tiktok" || p === "youtube") return 60;
  if (p === "niconico") return 300;
  return Infinity;
}

const hasWindow = () => {
  return typeof window === "object";
};

const Home: NextPage = () => {
  const t = useCallback((key: string, options?: Record<string, unknown>) => i18n.t(key, options), []);
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
  // 起動時は互換性優先で Canvas 2D を標準にする
  const [rendererType, setRendererType] = useState<'canvas2d' | 'webgl'>('canvas2d');
  const exitConfirmRef = useRef(false);
  const [webCodecsSupported, setWebCodecsSupported] = useState<boolean>(false);
  const [hardwareEncoderSupport, setHardwareEncoderSupport] = useState<{
    h264: boolean;
    h265: boolean;
    vp9: boolean;
    av1: boolean;
  }>({ h264: false, h265: false, vp9: false, av1: false });

  const [snackBarProps, setSnackBarProps] = useState({
    isOpen: false,
    message: "",
  });
  const openSnackBar = useCallback((message: string) => {
    setSnackBarProps({ isOpen: true, message });
  }, []);
  const handleClose = useCallback(
    (_event?: React.SyntheticEvent | Event, reason?: string) => {
      if (reason === "clickaway") {
        return;
      }
      setSnackBarProps((prev) => ({ isOpen: false, message: prev.message }));
    },
    []
  );

  const snackbarFileGate = useCallback(
    (gate: FileGate, kind: "image" | "audio" | "video") => {
      if (isFileGateFailure(gate)) {
        const maxImageMB = Math.round(MAX_IMAGE_BYTES / 1024 / 1024);
        const maxMediaMB = Math.round(MAX_MEDIA_BYTES / 1024 / 1024);
        if (gate.reason === "size") {
          openSnackBar(
            t("snackbar.fileTooLarge", {
              maxMB: kind === "image" ? maxImageMB : maxMediaMB,
            })
          );
        } else if (gate.reason === "mime") {
          openSnackBar(t("snackbar.fileMimeRejected"));
        } else if (kind === "image") {
          openSnackBar(t("snackbar.imageTypeNotSupported"));
        } else if (kind === "audio") {
          openSnackBar(t("snackbar.audioTypeNotSupported"));
        } else {
          openSnackBar(t("snackbar.videoLoadFailed"));
        }
        return true;
      }
      return false;
    },
    [t, openSnackBar]
  );

  // 離脱ガード（画像/音楽選択時のみ、MP4ダウンロード完了またはクリアで解除）
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (exitConfirmRef.current) {
        e.preventDefault();
        e.returnValue = t("beforeUnload");
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [t]);

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
  const playbackWindowTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const loadVideoAsAudioSource = useCallback(
    (file: File) => {
      const g = gateVideoAsMediaFile(file);
      if (snackbarFileGate(g, "video")) {
        return;
      }
      const video = document.createElement("video");
      video.preload = "auto";
      video.crossOrigin = "anonymous";
      video.src = URL.createObjectURL(file);
      videoElementRef.current = video;

      video.onloadedmetadata = () => {
        try {
          mediaElementSourceRef.current?.disconnect();
          const source = audioCtxRef.current.createMediaElementSource(video);
          mediaElementSourceRef.current = source;
          source.connect(analyserRef.current);
          analyserRef.current.connect(audioCtxRef.current.destination);
          analyserRef.current.connect(streamDestinationRef.current);

          video.onended = () => {
            setIsPlaySound(false);
            stopCanvas2DAnimation();
            stopWebGLAnimation();
          };

          setPlaySoundDisabled(false);
          setRecordMovieDisabled(false);
          setAudioFileName(file.name);
          exitConfirmRef.current = true;
          openSnackBar(t("snackbar.videoAudioLoaded"));
        } catch (error) {
          openSnackBar(t("snackbar.videoAudioFailed", { error }));
          videoElementRef.current = null;
        }
      };
      video.onerror = () => {
        openSnackBar(t("snackbar.videoLoadFailed"));
        videoElementRef.current = null;
      };
    },
    [t, openSnackBar, snackbarFileGate]
  );

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

  // エフェクト強度スライダー対象（UI表示するもの + 非表示だが旧設定互換のもの）
  const EFFECT_TYPES_STRENGTH_UI: EffectType[] = [
    "space",
    "spaceConstant",
    "spaceAudio",
    "sparkle",
    "dust",
    "rain",
    "snow",
  ];
  const EFFECT_TYPES_STRENGTH_LEGACY_HIDDEN: EffectType[] = ["vignette", "rainbow", "curtain"];
  const ALL_EFFECT_STRENGTH_TYPES: EffectType[] = [
    ...EFFECT_TYPES_STRENGTH_UI,
    ...EFFECT_TYPES_STRENGTH_LEGACY_HIDDEN,
  ];
  const VALID_SAVED_EFFECT_TYPES: EffectType[] = [
    "none",
    "space",
    "spaceConstant",
    "spaceAudio",
    "vignette",
    "rainbow",
    "curtain",
    "sparkle",
    "dust",
    "rain",
    "snow",
  ];
  const defaultEffectDensities = (): Partial<Record<EffectType, EffectDensity>> => {
    const o: Partial<Record<EffectType, EffectDensity>> = {};
    ALL_EFFECT_STRENGTH_TYPES.forEach((t) => {
      o[t] = 2;
    });
    return o;
  };
  const [effectType, setEffectType] = useState<EffectType>("none");
  const [effectDensities, setEffectDensities] = useState<Partial<Record<EffectType, EffectDensity>>>(defaultEffectDensities());
  const effectDensity = (effectType === "none" ? 2 : (effectDensities[effectType] ?? 2)) as EffectDensity;

  // ショート動画向け出力範囲（ALL 時は全長。それ以外は開始位置・秒数が有効）
  const [shortOutputPreset, setShortOutputPreset] = useState<ShortOutputPreset>("all");
  const [shortStartSecStr, setShortStartSecStr] = useState<string>("0");
  const [shortDurationSecStr, setShortDurationSecStr] = useState<string>("");

  type WeatherAdjust = { angleDeg: number; amount: number; color: string };
  const DEFAULT_RAIN_WEATHER: WeatherAdjust = { angleDeg: 22, amount: 0.7, color: "#6ba3ff" };
  const DEFAULT_SNOW_WEATHER: WeatherAdjust = { angleDeg: 10, amount: 0.6, color: "#ffffff" };
  const [rainWeather, setRainWeather] = useState<WeatherAdjust>(DEFAULT_RAIN_WEATHER);
  const [snowWeather, setSnowWeather] = useState<WeatherAdjust>(DEFAULT_SNOW_WEATHER);

  const [settingsTab, setSettingsTab] = useState(0);
  const [rainColorInput, setRainColorInput] = useState<string>(DEFAULT_RAIN_WEATHER.color.toUpperCase());
  const [snowColorInput, setSnowColorInput] = useState<string>(DEFAULT_SNOW_WEATHER.color.toUpperCase());
  const isSpaceEffect = effectType === "space" || effectType === "spaceConstant" || effectType === "spaceAudio";

  const effectForCanvas = useMemo((): EffectParams | undefined => {
    if (effectType === "none") return undefined;
    const base: EffectParams = { type: effectType, density: effectDensity };
    if (effectType === "rain") {
      base.weatherAngleDeg = rainWeather.angleDeg;
      base.weatherAmount = rainWeather.amount;
      base.weatherColor = rainWeather.color;
    } else if (effectType === "snow") {
      base.weatherAngleDeg = snowWeather.angleDeg;
      base.weatherAmount = snowWeather.amount;
      base.weatherColor = snowWeather.color;
    }
    return base;
  }, [effectType, effectDensity, rainWeather, snowWeather]);

  // スペクトラム調整
  const [spectrumOpacityPercent, setSpectrumOpacityPercent] = useState<number>(10);  // 透過率0-100%、0=完全表示
  const [spectrumFps, setSpectrumFps] = useState<number>(30);               // 1〜60
  const [lineWidthWaveform, setLineWidthWaveform] = useState<number>(3.2);  // mode1
  const [lineWidthCircle, setLineWidthCircle] = useState<number>(3.2);      // mode2
  const [lineWidthSymWave, setLineWidthSymWave] = useState<number>(3.6);    // mode5
  const [glycoColorSet, setGlycoColorSet] = useState<string>("amber");

  // 音量設定（共通設定: 目標LUFS、null=正規化なし）
  const [targetLufs, setTargetLufs] = useState<number | null>(null);
  const [targetLufsCustom, setTargetLufsCustom] = useState<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (targetLufs != null) localStorage.setItem("common_targetLufs", String(targetLufs));
    else localStorage.removeItem("common_targetLufs");
  }, [targetLufs]);

  // 共通設定の保存（音量・エフェクト種類・各エフェクト強度・グライコ色・透過率）
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("common_effectType", effectType);
    localStorage.setItem("common_effectDensities", JSON.stringify(effectDensities));
    localStorage.setItem("common_glycoColorSet", glycoColorSet);
    localStorage.setItem("common_spectrumOpacityPercent", String(spectrumOpacityPercent));
  }, [effectType, effectDensities, glycoColorSet, spectrumOpacityPercent]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("common_rainWeather", JSON.stringify(rainWeather));
  }, [rainWeather]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("common_snowWeather", JSON.stringify(snowWeather));
  }, [snowWeather]);

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
        glycoColorSet,
        spectrumOpacityPercent,
        rendererType,
        rainWeather,
        snowWeather,
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
    [
      "common_targetLufs",
      "common_effectType",
      "common_effectDensities",
      "common_glycoColorSet",
      "common_spectrumOpacityPercent",
      "common_rainWeather",
      "common_snowWeather",
    ].forEach((k) => localStorage.removeItem(k));
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
        if (c.effectType && VALID_SAVED_EFFECT_TYPES.includes(c.effectType)) {
          localStorage.setItem("common_effectType", c.effectType);
          setEffectType(c.effectType);
        }
        if (c.effectDensities && typeof c.effectDensities === "object") {
          const merged = { ...effectDensities };
          ALL_EFFECT_STRENGTH_TYPES.forEach((t) => {
            if (c.effectDensities[t] === 1 || c.effectDensities[t] === 2 || c.effectDensities[t] === 3) {
              merged[t] = c.effectDensities[t];
            }
          });
          localStorage.setItem("common_effectDensities", JSON.stringify(merged));
          setEffectDensities(merged);
        }
        if (c.glycoColorSet && (GLYCO_COLOR_SETS[c.glycoColorSet] || GLYCO_GRADIENT_SETS[c.glycoColorSet] || c.glycoColorSet === "verticalEQ" || c.glycoColorSet === "verticalEQFixed")) {
          localStorage.setItem("common_glycoColorSet", c.glycoColorSet);
          setGlycoColorSet(c.glycoColorSet);
        }
        if (c.spectrumOpacityPercent !== undefined) {
          const v = Number(c.spectrumOpacityPercent);
          if (!isNaN(v) && v >= 0 && v <= 100) {
            localStorage.setItem("common_spectrumOpacityPercent", String(v));
            setSpectrumOpacityPercent(v);
          }
        }
        if (c.rendererType === "canvas2d" || c.rendererType === "webgl") {
          localStorage.setItem("common_rendererType", c.rendererType);
          setRendererType(c.rendererType);
        }
        if (c.rainWeather && typeof c.rainWeather === "object") {
          const rw = c.rainWeather as WeatherAdjust;
          if (
            typeof rw.angleDeg === "number" &&
            typeof rw.amount === "number" &&
            typeof rw.color === "string"
          ) {
            setRainWeather({
              angleDeg: Math.max(-90, Math.min(90, rw.angleDeg)),
              amount: Math.max(0.05, Math.min(1, rw.amount)),
              color: /^#[0-9a-fA-F]{6}$/.test(rw.color) ? rw.color : DEFAULT_RAIN_WEATHER.color,
            });
          }
        }
        if (c.snowWeather && typeof c.snowWeather === "object") {
          const sw = c.snowWeather as WeatherAdjust;
          if (
            typeof sw.angleDeg === "number" &&
            typeof sw.amount === "number" &&
            typeof sw.color === "string"
          ) {
            setSnowWeather({
              angleDeg: Math.max(-90, Math.min(90, sw.angleDeg)),
              amount: Math.max(0.05, Math.min(1, sw.amount)),
              color: /^#[0-9a-fA-F]{6}$/.test(sw.color) ? sw.color : DEFAULT_SNOW_WEATHER.color,
            });
          }
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
        if (as.effectType && VALID_SAVED_EFFECT_TYPES.includes(as.effectType as EffectType)) {
          setEffectType(as.effectType as EffectType);
        }
        if (as.effectDensities) {
          setEffectDensities((prev) => {
            const merged = { ...prev };
            ALL_EFFECT_STRENGTH_TYPES.forEach((t) => {
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

  useEffect(() => {
    setRainColorInput(rainWeather.color.toUpperCase());
  }, [rainWeather.color]);

  useEffect(() => {
    setSnowColorInput(snowWeather.color.toUpperCase());
  }, [snowWeather.color]);

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
  // Canvas用ImageContext
  const [imageCtx, setImageCtx] = useState<HTMLImageElement>(null);

  // マウント後にlocalStorageから設定を読み込み（ハイドレーション一致のためクライアントのみ）
  useEffect(() => {
    const savedMode = localStorage.getItem("session_mode");
    let modeVal = savedMode ? parseInt(savedMode, 10) : 0;
    // UI 非表示のモード（折れ線=1・波形上下対称=5）は周波数バーへ
    if (modeVal === 1 || modeVal === 5) {
      modeVal = 0;
      localStorage.setItem("session_mode", "0");
    }
    setMode(modeVal);

    const savedSize = localStorage.getItem("session_canvasSize");
    const sizeVal = (savedSize === "1080x1920" || savedSize === "1920x1920") ? savedSize : "1920x1080";
    setCanvasSize(sizeVal);

    const savedEffectType = localStorage.getItem("common_effectType");
    if (savedEffectType && VALID_SAVED_EFFECT_TYPES.includes(savedEffectType as EffectType)) {
      setEffectType(savedEffectType as EffectType);
    }

    try {
      const savedDensities = localStorage.getItem("common_effectDensities");
      if (savedDensities) {
        const parsed = JSON.parse(savedDensities) as Partial<Record<EffectType, EffectDensity>>;
        const result = defaultEffectDensities();
        ALL_EFFECT_STRENGTH_TYPES.forEach((t) => {
          if (parsed[t] === 1 || parsed[t] === 2 || parsed[t] === 3) result[t] = parsed[t];
        });
        setEffectDensities(result);
      }
    } catch (_e) { /* ignore */ }

    const savedGlyco = localStorage.getItem("common_glycoColorSet");
    if (savedGlyco && (GLYCO_COLOR_SETS[savedGlyco] || GLYCO_GRADIENT_SETS[savedGlyco] || savedGlyco === "verticalEQ" || savedGlyco === "verticalEQFixed")) {
      setGlycoColorSet(savedGlyco);
    }

    const savedOpacity = localStorage.getItem("common_spectrumOpacityPercent");
    if (savedOpacity) {
      const n = parseInt(savedOpacity, 10);
      if (!isNaN(n) && n >= 0 && n <= 100) setSpectrumOpacityPercent(n);
    } else {
      const oldOpacity = localStorage.getItem("common_spectrumOpacity");
      if (oldOpacity) {
        const o = parseFloat(oldOpacity);
        if (!isNaN(o) && o >= 0.1 && o <= 1) setSpectrumOpacityPercent(Math.round((1 - o) * 100));
      }
    }

    const savedLufs = localStorage.getItem("common_targetLufs");
    if (savedLufs) {
      const n = parseFloat(savedLufs);
      setTargetLufs(n);
      setTargetLufsCustom(n !== -14 && n !== -15 ? String(n) : "");
    }

    const savedRenderer = localStorage.getItem("common_rendererType");
    if (savedRenderer === "canvas2d" || savedRenderer === "webgl") {
      setRendererType(savedRenderer);
    }

    try {
      const rw = localStorage.getItem("common_rainWeather");
      if (rw) {
        const p = JSON.parse(rw) as WeatherAdjust;
        if (
          typeof p?.angleDeg === "number" &&
          typeof p?.amount === "number" &&
          typeof p?.color === "string"
        ) {
          setRainWeather({
            angleDeg: Math.max(-90, Math.min(90, p.angleDeg)),
            amount: Math.max(0.05, Math.min(1, p.amount)),
            color: /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : DEFAULT_RAIN_WEATHER.color,
          });
        }
      }
    } catch (_e) { /* ignore */ }

    try {
      const sw = localStorage.getItem("common_snowWeather");
      if (sw) {
        const p = JSON.parse(sw) as WeatherAdjust;
        if (
          typeof p?.angleDeg === "number" &&
          typeof p?.amount === "number" &&
          typeof p?.color === "string"
        ) {
          setSnowWeather({
            angleDeg: Math.max(-90, Math.min(90, p.angleDeg)),
            amount: Math.max(0.05, Math.min(1, p.amount)),
            color: /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : DEFAULT_SNOW_WEATHER.color,
          });
        }
      }
    } catch (_e) { /* ignore */ }

    const adj = loadSettings(sizeVal as CanvasSize, modeVal);
    if (adj) setModeAdjustments(adj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GPU情報取得・初回はベンチマークで高速なレンダラーを自動選択
  useEffect(() => {
    const initGpu = async () => {
      const info = getGpuInfo();
      setGpuInfo(info);

      const savedRenderer = localStorage.getItem("common_rendererType");
      if (!savedRenderer && info.isWebGLSupported) {
        const faster = await benchmarkRenderers();
        setRendererType(faster);
        localStorage.setItem("common_rendererType", faster);
      }

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
    const effect = effectForCanvas;
    const isEffectActive = isPlaySound || isRecording;
    const spectrumSettings = {
      opacity: 1 - spectrumOpacityPercent / 100,
      fps: spectrumFps,
      lineWidthWaveform,
      lineWidthCircle,
      lineWidthSymWave,
      glycoColorSet,
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
  }, [
    canvasSize,
    imageCtx,
    mode,
    modeAdjustments,
    rendererType,
    effectForCanvas,
    isPlaySound,
    isRecording,
    glycoColorSet,
    spectrumOpacityPercent,
    spectrumFps,
    lineWidthWaveform,
    lineWidthCircle,
    lineWidthSymWave,
  ]);

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

  // 画像読み込み処理（共通）
  const loadImageFile = (file: File) => {
    const gi = gateImageFile(file);
    if (snackbarFileGate(gi, "image")) {
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (!canvasRef.current) {
        return;
      }
      setImageCtx(image);
      setImageFileName(file.name);
      exitConfirmRef.current = true;
      openSnackBar(t("snackbar.imageLoaded"));
    };
    image.onerror = (e) => {
      console.error("画像の読み込みに失敗しました:", e);
      openSnackBar(t("snackbar.imageLoadFailed"));
    };
    image.src = URL.createObjectURL(file);
  };

  // 音楽読み込み処理（共通）
  const loadAudioFile = async (file: File) => {
    const ga = gateAudioFile(file);
    if (snackbarFileGate(ga, "audio")) {
      return;
    }
    try {
      const arraybuffer = await file.arrayBuffer();
      decodedAudioBufferRef.current = await audioCtxRef.current.decodeAudioData(
        arraybuffer
      );
      setPlaySoundDisabled(false);
      setRecordMovieDisabled(false);
      setAudioFileName(file.name);
      exitConfirmRef.current = true;
      openSnackBar(t("snackbar.audioLoaded"));
    } catch (error) {
      openSnackBar(t("snackbar.audioLoadFailed", { error }));
    }
  };

  // 画像ボタンから読み込み
  const imageLoad = (event: { target: HTMLInputElement }) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    if (isVideoFileByName(file.name)) {
      openSnackBar(t("snackbar.imageVideoNotAllowed"));
      event.target.value = "";
      return;
    }
    if (!isImageFileByName(file.name)) {
      openSnackBar(t("snackbar.imageTypeNotSupported"));
      event.target.value = "";
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
    try {
      if (isVideoFileByName(file.name)) {
        loadVideoAsAudioSource(file);
        return;
      }
      await loadAudioFile(file);
    } finally {
      event.target.value = "";
    }
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
      if (isImageFileByName(file.name) && !imageFile) {
        imageFile = file;
      } else if (isAudioFileByName(file.name) && !audioFile) {
        audioFile = file;
      } else if (isVideoFileByName(file.name)) {
        if (!audioFile) {
          audioFile = file;
        }
      }
    }

    // 画像ファイルを読み込み
    if (imageFile) {
      loadImageFile(imageFile);
    }

    if (audioFile) {
      if (isVideoFileByName(audioFile.name)) {
        loadVideoAsAudioSource(audioFile);
      } else {
        await loadAudioFile(audioFile);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const getMediaDurationSec = useCallback((): number => {
    const v = videoElementRef.current;
    if (v && Number.isFinite(v.duration) && v.duration > 0) {
      return v.duration;
    }
    const b = decodedAudioBufferRef.current;
    if (b && Number.isFinite(b.duration) && b.duration > 0) {
      return b.duration;
    }
    return 0;
  }, []);

  const resolvePlaybackWindow = useCallback((): ResolvedClip => {
    if (shortOutputPreset === "all") {
      return { full: true };
    }
    const mediaDur = getMediaDurationSec();
    if (!(mediaDur > 0)) {
      return { full: true };
    }
    const maxPlat = getShortPlatformMaxSec(shortOutputPreset);
    let start = parseFloat(shortStartSecStr.replace(",", "."));
    if (!Number.isFinite(start)) {
      start = 0;
    }
    const durationParsed = parseFloat(shortDurationSecStr.replace(",", "."));
    let duration: number;
    if (!shortDurationSecStr.trim() || !Number.isFinite(durationParsed)) {
      duration = Math.min(maxPlat, Math.max(0, mediaDur - start));
    } else {
      duration = durationParsed;
    }
    start = Math.max(0, Math.min(start, mediaDur));
    duration = Math.max(0, Math.min(duration, maxPlat, mediaDur - start));
    return { full: false, start, duration };
  }, [shortOutputPreset, shortStartSecStr, shortDurationSecStr, getMediaDurationSec]);

  const clearPlaybackWindowTimer = useCallback(() => {
    if (playbackWindowTimerRef.current != null) {
      window.clearTimeout(playbackWindowTimerRef.current);
      playbackWindowTimerRef.current = null;
    }
  }, []);

  const setupAudioSourceForPlayback = (clip: ResolvedClip) => {
    if (videoElementRef.current) {
      const video = videoElementRef.current;
      if (!video.paused) {
        video.pause();
      }
      if (clip.full === false) {
        video.currentTime = clip.start;
      } else {
        video.currentTime = 0;
      }
      return;
    }
    if (!decodedAudioBufferRef.current) {
      return;
    }
    const audioBufferSourceNode = audioCtxRef.current.createBufferSource();
    audioBufferSourceNode.buffer = decodedAudioBufferRef.current;
    audioBufferSourceNode.loop = false;
    audioBufferSourceNode.onended = () => {
      setIsPlaySound(false);
      stopCanvas2DAnimation();
      stopWebGLAnimation();
    };
    audioBufferSourceNode.connect(analyserRef.current);
    analyserRef.current.connect(audioCtxRef.current.destination);
    analyserRef.current.connect(streamDestinationRef.current);
    audioBufferSrcRef.current = audioBufferSourceNode;
  };

  const finishVideoWindowPlayback = useCallback(() => {
    clearPlaybackWindowTimer();
    if (videoElementRef.current) {
      videoElementRef.current.pause();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsPlaySound(false);
    stopCanvas2DAnimation();
    stopWebGLAnimation();
  }, [clearPlaybackWindowTimer]);

  // PlaySoundEvent
  const onPlaySound = () => {
    if (isPlaySound) {
      clearPlaybackWindowTimer();
      if (audioBufferSrcRef.current) {
        try {
          audioBufferSrcRef.current.stop(0);
        } catch {
          /* already stopped */
        }
      }
      if (videoElementRef.current) {
        videoElementRef.current.pause();
      }
      stopCanvas2DAnimation();
      stopWebGLAnimation();
      setIsPlaySound(false);
      return;
    }
    const clip = resolvePlaybackWindow();
    if (clip.full === false && clip.duration <= 0) {
      openSnackBar(t("snackbar.shortClipInvalid"));
      return;
    }
    setupAudioSourceForPlayback(clip);

    if (videoElementRef.current) {
      videoElementRef.current.play().then(() => {
        if (clip.full === false && clip.duration > 0) {
          clearPlaybackWindowTimer();
          const durationSec = clip.duration;
          playbackWindowTimerRef.current = window.setTimeout(() => {
            playbackWindowTimerRef.current = null;
            finishVideoWindowPlayback();
          }, durationSec * 1000);
        }
      });
    } else if (audioBufferSrcRef.current) {
      if (clip.full === false) {
        audioBufferSrcRef.current.start(0, clip.start, clip.duration);
      } else {
        audioBufferSrcRef.current.start(0);
      }
    }

    setIsPlaySound(true);
  };
  // RecordMovieEvent
  const onRecordMovie = () => {
    if (!canvasRef.current) {
      openSnackBar(t("snackbar.canvasNotReady"));
      return;
    }
    
    // 録画開始フラグを先に設定
    setIsRecording(true);
    
    // キャンバスアニメーションを確実に開始（前回ストップで停止している場合に備える）
    const effect = effectForCanvas;
    const spectrumSettings = {
      opacity: 1 - spectrumOpacityPercent / 100,
      fps: spectrumFps,
      lineWidthWaveform,
      lineWidthCircle,
      lineWidthSymWave,
      glycoColorSet,
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
        mediaRecorderRef.current = null;
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
          exitConfirmRef.current = false;
          openSnackBar(t("snackbar.convertComplete"));
        } catch (error) {
          openSnackBar(t("snackbar.convertFailed", { error: (error as Error).message }));
          setEncodeStatus("idle");
        } finally {
          setRecordMovieDisabled(false);
        }
      });
      mediaRecorderRef.current = recorder;
      recorder.start();
      openSnackBar(t("snackbar.recording"));
      onPlaySound();
      setRecordMovieDisabled(true);

      const clip = resolvePlaybackWindow();

      // 再生終了時の処理（音声はスライス再生時も onended で区間終了）
      if (videoElementRef.current) {
        if (clip.full !== false) {
          const originalOnEnded = videoElementRef.current.onended;
          videoElementRef.current.onended = () => {
            if (originalOnEnded) {
              originalOnEnded.call(videoElementRef.current);
            }
            recorder.stop();
            setIsRecording(false);
            setIsPlaySound(false);
          };
        }
        // ショート区間の動画は onPlaySound 内のタイマーで停止・recorder.stop
      } else if (audioBufferSrcRef.current) {
        audioBufferSrcRef.current.onended = () => {
          recorder.stop();
          setIsRecording(false);
          setIsPlaySound(false);
        };
      }
    }, 100); // 100ms待機して録画用canvasのアニメーション開始を保証
  };

  // クリア（ページロード時の状態に戻す）
  const onClear = () => {
    clearPlaybackWindowTimer();
    mediaRecorderRef.current = null;
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
    setShortOutputPreset("all");
    setShortStartSecStr("0");
    setShortDurationSecStr("");
    setRainWeather(DEFAULT_RAIN_WEATHER);
    setSnowWeather(DEFAULT_SNOW_WEATHER);
    setTargetLufs(null);
    setTargetLufsCustom("");
    exitConfirmRef.current = false;
    openSnackBar(t("snackbar.cleared"));
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
                {t("encode.warning")}
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
                    ? t("encode.loadingFfmpeg")
                    : t("encode.converting", { progress: encodeProgress })}
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
          <h1 className={styles.heading__title}>{t("heading.title")}</h1>
          <div className={styles.heading__text}>
            <p>{t("heading.description")}</p>
            <p className={styles.heading__terms}>
              <a
                href="https://github.com/kuwa2005/music-waves-visualizer/blob/master/USER_TERMS.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("heading.termsLink")}
              </a>
            </p>
          </div>
        </div>

        <div
          className={styles.dropZone}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <Typography variant="body2" sx={{ mb: 0.25, fontWeight: 500 }}>
            {t("dropZone.hint")}
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
                {t("dropZone.selectImage")}
                <input
                  type="file"
                  accept="image/*"
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
                {imageFileName || t("dropZone.unselected")}
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
                {t("dropZone.selectAudio")}
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
                {audioFileName || t("dropZone.unselected")}
              </Typography>
            </Box>
          </Box>
          <Typography variant="caption" color="textSecondary" sx={{ mt: 0, display: "block" }}>
            {t("dropZone.caption")}
          </Typography>
        </div>

        <div className={styles.menu}>
          <Box sx={{ borderBottom: 1, borderColor: "divider", width: "100%" }}>
            <Tabs
              value={settingsTab}
              onChange={(_, v) => setSettingsTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
            >
              <Tab label={t("tabs.spectrum")} />
              <Tab label={t("tabs.effects")} />
              <Tab label={t("tabs.audio")} />
              <Tab label={t("tabs.clipLength")} />
              <Tab label={t("tabs.settings")} />
            </Tabs>
          </Box>
          <div className={styles.menu__controls}>
            {settingsTab === 0 && (
              <Box sx={{ width: "100%", maxWidth: 600, margin: "0 auto", py: 1 }}>
                <Typography variant="body2" sx={{ mb: 1, textAlign: "center", fontWeight: 500 }}>
                  {t("spectrum.title")}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap", mb: 2 }}>
                  {[
                    { value: -1, label: t("spectrum.off") },
                    { value: 0, label: t("spectrum.freqBar") },
                    { value: 2, label: t("spectrum.circle") },
                    { value: 3, label: t("spectrum.symBar") },
                    { value: 4, label: t("spectrum.dot") },
                    { value: 6, label: t("spectrum.glyco") },
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
                <Accordion sx={{ mt: 2 }}>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {t("spectrum.parameters")}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                      {t("displayVolume.spectrumTitle")}
                    </Typography>
                    <Box sx={{ mb: 2 }}>
                      <Typography gutterBottom>{t("displayVolume.opacity", { value: spectrumOpacityPercent })}</Typography>
                      <Slider
                        value={spectrumOpacityPercent}
                        min={0}
                        max={100}
                        step={5}
                        onChange={(_, v) => setSpectrumOpacityPercent(v as number)}
                      />
                    </Box>
                    <Box sx={{ mb: 2 }}>
                      <Typography gutterBottom>{t("displayVolume.fps", { value: spectrumFps })}</Typography>
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
                        <Typography gutterBottom>{t("displayVolume.lineWidthWaveform", { value: lineWidthWaveform.toFixed(1) })}</Typography>
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
                        <Typography gutterBottom>{t("displayVolume.lineWidthCircle", { value: lineWidthCircle.toFixed(1) })}</Typography>
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
                        <Typography gutterBottom>{t("displayVolume.lineWidthSymWave", { value: lineWidthSymWave.toFixed(1) })}</Typography>
                        <Slider
                          value={lineWidthSymWave}
                          min={1}
                          max={8}
                          step={0.1}
                          onChange={(_, v) => setLineWidthSymWave(v as number)}
                        />
                      </Box>
                    )}
                    {mode === 6 && (
                      <Box sx={{ mb: 3 }}>
                        <Typography gutterBottom>{t("displayVolume.glycoColor")}</Typography>
                        <FormControl size="small" fullWidth sx={{ mt: 1 }}>
                          <InputLabel>{t("displayVolume.colorSet")}</InputLabel>
                          <Select
                            value={glycoColorSet}
                            label={t("displayVolume.colorSet")}
                            onChange={(e) => setGlycoColorSet(e.target.value)}
                          >
                            <MenuItem value="amber">{t("glycoColors.amber")}</MenuItem>
                            <MenuItem value="green">{t("glycoColors.green")}</MenuItem>
                            <MenuItem value="red">{t("glycoColors.red")}</MenuItem>
                            <MenuItem value="blue">{t("glycoColors.blue")}</MenuItem>
                            <MenuItem value="yellow">{t("glycoColors.yellow")}</MenuItem>
                            <MenuItem value="white">{t("glycoColors.white")}</MenuItem>
                            <MenuItem value="cyan">{t("glycoColors.cyan")}</MenuItem>
                            <MenuItem value="magenta">{t("glycoColors.magenta")}</MenuItem>
                            <MenuItem value="neonGreen">{t("glycoColors.neonGreen")}</MenuItem>
                            <MenuItem value="neonPink">{t("glycoColors.neonPink")}</MenuItem>
                            <MenuItem value="neonCyan">{t("glycoColors.neonCyan")}</MenuItem>
                            <MenuItem value="rainbow">{t("glycoColors.rainbow")}</MenuItem>
                            <MenuItem value="blueGreen">{t("glycoColors.blueGreen")}</MenuItem>
                            <MenuItem value="redYellow">{t("glycoColors.redYellow")}</MenuItem>
                            <MenuItem value="verticalEQ">{t("glycoColors.verticalEQ")}</MenuItem>
                            <MenuItem value="verticalEQFixed">{t("glycoColors.verticalEQFixed")}</MenuItem>
                          </Select>
                        </FormControl>
                      </Box>
                    )}
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                      {t("displayVolume.adjustTitle")}
                    </Typography>
                    <Typography gutterBottom>{t("displayVolume.scaleX", { value: modeAdjustments.scaleX.toFixed(2) })}</Typography>
                    <Slider
                      value={modeAdjustments.scaleX}
                      onChange={(_, value) => handleAdjustmentChange("scaleX", value as number)}
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
                      {t("displayVolume.scaleY", { value: modeAdjustments.scaleY.toFixed(2) })}
                    </Typography>
                    <Slider
                      value={modeAdjustments.scaleY}
                      onChange={(_, value) => handleAdjustmentChange("scaleY", value as number)}
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
                      {t("displayVolume.offsetX", {
                        value: modeAdjustments.offsetX.toFixed(1),
                        px: Math.round((getCanvasDimensions(canvasSize).width * modeAdjustments.offsetX) / 100),
                      })}
                    </Typography>
                    <Slider
                      value={modeAdjustments.offsetX}
                      onChange={(_, value) => handleAdjustmentChange("offsetX", value as number)}
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
                      {t("displayVolume.offsetY", {
                        value: modeAdjustments.offsetY.toFixed(1),
                        px: Math.round((getCanvasDimensions(canvasSize).height * modeAdjustments.offsetY) / 100),
                      })}
                    </Typography>
                    <Slider
                      value={modeAdjustments.offsetY}
                      onChange={(_, value) => handleAdjustmentChange("offsetY", value as number)}
                      min={-150}
                      max={150}
                      step={1}
                      marks={[
                        { value: -150, label: "-150%" },
                        { value: 0, label: "0%" },
                        { value: 150, label: "150%" },
                      ]}
                    />
                  </AccordionDetails>
                </Accordion>
              </Box>
            )}

            {settingsTab === 1 && (
              <Box sx={{ py: 1, width: "100%" }}>
                <Typography variant="body2" sx={{ mb: 1, textAlign: "center", fontWeight: 500 }}>
                  {t("effect.title")}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
                  <Button variant={effectType === "none" ? "contained" : "outlined"} onClick={() => setEffectType("none")} size="small">
                    {t("effect.off")}
                  </Button>
                  <Button variant={isSpaceEffect ? "contained" : "outlined"} onClick={() => setEffectType("space")} size="small">
                    {t("effect.space")}
                  </Button>
                  <Button variant={effectType === "sparkle" ? "contained" : "outlined"} onClick={() => setEffectType("sparkle")} size="small">
                    {t("effect.sparkle")}
                  </Button>
                  <Button variant={effectType === "dust" ? "contained" : "outlined"} onClick={() => setEffectType("dust")} size="small">
                    {t("effect.dust")}
                  </Button>
                  <Button variant={effectType === "rain" ? "contained" : "outlined"} onClick={() => setEffectType("rain")} size="small">
                    {t("effect.rain")}
                  </Button>
                  <Button variant={effectType === "snow" ? "contained" : "outlined"} onClick={() => setEffectType("snow")} size="small">
                    {t("effect.snow")}
                  </Button>
                </Box>
                <Accordion sx={{ mt: 2 }}>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {t("effect.parameters")}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    {effectType !== "none" && ALL_EFFECT_STRENGTH_TYPES.includes(effectType) && (
                      <Box
                        sx={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 1,
                          justifyContent: "center",
                          alignItems: "center",
                          width: "100%",
                        }}
                      >
                        <Typography variant="caption" color="textSecondary">
                          {t("effect.strength")}
                        </Typography>
                        {([1, 2, 3] as EffectDensity[]).map((d) => (
                          <Button
                            key={d}
                            variant={effectDensity === d ? "contained" : "outlined"}
                            onClick={() => setEffectDensities((prev) => ({ ...prev, [effectType]: d }))}
                            size="small"
                          >
                            {d === 1 ? t("effect.weak") : d === 2 ? t("effect.medium") : t("effect.strong")}
                          </Button>
                        ))}
                      </Box>
                    )}
                    {isSpaceEffect && (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "center", alignItems: "center", mt: 1.5 }}>
                        <Typography variant="caption" color="textSecondary">
                          {t("effect.spaceType")}
                        </Typography>
                        <Button
                          variant={effectType === "space" ? "contained" : "outlined"}
                          onClick={() => setEffectType("space")}
                          size="small"
                        >
                          {t("effect.space1")}
                        </Button>
                        <Button
                          variant={effectType === "spaceConstant" ? "contained" : "outlined"}
                          onClick={() => setEffectType("spaceConstant")}
                          size="small"
                        >
                          {t("effect.space2")}
                        </Button>
                        <Button
                          variant={effectType === "spaceAudio" ? "contained" : "outlined"}
                          onClick={() => setEffectType("spaceAudio")}
                          size="small"
                        >
                          {t("effect.space3")}
                        </Button>
                      </Box>
                    )}
                    {effectType === "rain" && (
                      <Box sx={{ width: "100%", maxWidth: 440, mt: 2, mx: "auto" }}>
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.weatherAngle", { value: rainWeather.angleDeg })}
                        </Typography>
                        <Slider
                          value={rainWeather.angleDeg}
                          min={-75}
                          max={75}
                          step={1}
                          onChange={(_, v) => setRainWeather((p) => ({ ...p, angleDeg: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 1 }}>
                          {t("effect.weatherAmount", { value: Math.round(rainWeather.amount * 100) })}
                        </Typography>
                        <Slider
                          value={rainWeather.amount}
                          min={0.05}
                          max={1}
                          step={0.05}
                          onChange={(_, v) => setRainWeather((p) => ({ ...p, amount: v as number }))}
                        />
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 0.5 }}>
                            {t("effect.weatherColor")}
                          </Typography>
                          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 1 }}>
                            {BASIC_COLOR_PALETTE_16.map((c) => (
                              <Box
                                key={`rain-${c}`}
                                component="button"
                                type="button"
                                aria-label={`${t("effect.weatherColor")} ${c}`}
                                onClick={() => setRainWeather((p) => ({ ...p, color: c }))}
                                sx={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: 0.75,
                                  border: rainWeather.color.toUpperCase() === c.toUpperCase() ? "2px solid #111" : "1px solid #999",
                                  backgroundColor: c,
                                  cursor: "pointer",
                                  p: 0,
                                }}
                              />
                            ))}
                          </Box>
                          <TextField
                            size="small"
                            label={t("effect.weatherColorCode")}
                            value={rainColorInput}
                            onChange={(e) => {
                              const next = normalizeHexColorInput(e.target.value);
                              setRainColorInput(next);
                              if (isHexColorCode(next)) {
                                setRainWeather((p) => ({ ...p, color: next }));
                              }
                            }}
                            error={rainColorInput.length > 0 && !isHexColorCode(rainColorInput)}
                            helperText={
                              rainColorInput.length > 0 && !isHexColorCode(rainColorInput)
                                ? t("effect.weatherColorCodeInvalid")
                                : " "
                            }
                            inputProps={{ inputMode: "text", pattern: "#?[0-9a-fA-F]{6}" }}
                            sx={{ width: 220 }}
                          />
                        </Box>
                      </Box>
                    )}
                    {effectType === "snow" && (
                      <Box sx={{ width: "100%", maxWidth: 440, mt: 2, mx: "auto" }}>
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.weatherAngle", { value: snowWeather.angleDeg })}
                        </Typography>
                        <Slider
                          value={snowWeather.angleDeg}
                          min={-60}
                          max={60}
                          step={1}
                          onChange={(_, v) => setSnowWeather((p) => ({ ...p, angleDeg: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 1 }}>
                          {t("effect.weatherAmount", { value: Math.round(snowWeather.amount * 100) })}
                        </Typography>
                        <Slider
                          value={snowWeather.amount}
                          min={0.05}
                          max={1}
                          step={0.05}
                          onChange={(_, v) => setSnowWeather((p) => ({ ...p, amount: v as number }))}
                        />
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 0.5 }}>
                            {t("effect.weatherColor")}
                          </Typography>
                          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 1 }}>
                            {BASIC_COLOR_PALETTE_16.map((c) => (
                              <Box
                                key={`snow-${c}`}
                                component="button"
                                type="button"
                                aria-label={`${t("effect.weatherColor")} ${c}`}
                                onClick={() => setSnowWeather((p) => ({ ...p, color: c }))}
                                sx={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: 0.75,
                                  border: snowWeather.color.toUpperCase() === c.toUpperCase() ? "2px solid #111" : "1px solid #999",
                                  backgroundColor: c,
                                  cursor: "pointer",
                                  p: 0,
                                }}
                              />
                            ))}
                          </Box>
                          <TextField
                            size="small"
                            label={t("effect.weatherColorCode")}
                            value={snowColorInput}
                            onChange={(e) => {
                              const next = normalizeHexColorInput(e.target.value);
                              setSnowColorInput(next);
                              if (isHexColorCode(next)) {
                                setSnowWeather((p) => ({ ...p, color: next }));
                              }
                            }}
                            error={snowColorInput.length > 0 && !isHexColorCode(snowColorInput)}
                            helperText={
                              snowColorInput.length > 0 && !isHexColorCode(snowColorInput)
                                ? t("effect.weatherColorCodeInvalid")
                                : " "
                            }
                            inputProps={{ inputMode: "text", pattern: "#?[0-9a-fA-F]{6}" }}
                            sx={{ width: 220 }}
                          />
                        </Box>
                      </Box>
                    )}
                  </AccordionDetails>
                </Accordion>
              </Box>
            )}

            {settingsTab === 2 && (
              <Box sx={{ width: "100%", maxWidth: 600, margin: "0 auto", py: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                  {t("audioSettings.title")}
                </Typography>
                <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                  {t("displayVolume.volumeCaption")}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                  <Button
                    variant={targetLufs === null ? "contained" : "outlined"}
                    size="small"
                    onClick={() => {
                      setTargetLufs(null);
                      setTargetLufsCustom("");
                    }}
                    sx={{ height: 36 }}
                  >
                    {t("displayVolume.none")}
                  </Button>
                  <Button
                    variant={targetLufs === -14 ? "contained" : "outlined"}
                    size="small"
                    onClick={() => {
                      setTargetLufs(-14);
                      setTargetLufsCustom("-14");
                    }}
                    sx={{ textTransform: "none", height: 36 }}
                  >
                    {t("displayVolume.youtube")}
                  </Button>
                  <Button
                    variant={targetLufs === -15 ? "contained" : "outlined"}
                    size="small"
                    onClick={() => {
                      setTargetLufs(-15);
                      setTargetLufsCustom("-15");
                    }}
                    sx={{ textTransform: "none", height: 36 }}
                  >
                    {t("displayVolume.nicovideo")}
                  </Button>
                  <TextField
                    size="small"
                    label={t("displayVolume.manualLabel")}
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
                    placeholder={t("displayVolume.manualPlaceholder")}
                    sx={{ width: 140, "& .MuiInputBase-root": { height: 36 } }}
                    inputProps={{ min: -60, max: 0, step: 0.5 }}
                  />
                </Box>
              </Box>
            )}

            {settingsTab === 3 && (
              <div className={styles.effectButtons} style={{ paddingTop: 8 }}>
                <Typography variant="body2" sx={{ mb: 1, textAlign: "center", fontWeight: 500 }}>
                  {t("shortOutput.title")}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
                  <Button
                    variant={shortOutputPreset === "all" ? "contained" : "outlined"}
                    onClick={() => setShortOutputPreset("all")}
                    size="small"
                    sx={{ height: 36 }}
                  >
                    {t("shortOutput.all")}
                  </Button>
                  <Button
                    variant={shortOutputPreset === "youtube" ? "contained" : "outlined"}
                    onClick={() => {
                      setShortOutputPreset("youtube");
                      setShortDurationSecStr("60");
                    }}
                    size="small"
                    sx={{ height: 36 }}
                  >
                    {t("shortOutput.youtube")}
                  </Button>
                  <Button
                    variant={shortOutputPreset === "tiktok" ? "contained" : "outlined"}
                    onClick={() => {
                      setShortOutputPreset("tiktok");
                      setShortDurationSecStr("60");
                    }}
                    size="small"
                    sx={{ height: 36 }}
                  >
                    {t("shortOutput.tiktok")}
                  </Button>
                  <Button
                    variant={shortOutputPreset === "niconico" ? "contained" : "outlined"}
                    onClick={() => {
                      setShortOutputPreset("niconico");
                      setShortDurationSecStr("300");
                    }}
                    size="small"
                    sx={{ height: 36 }}
                  >
                    {t("shortOutput.niconico")}
                  </Button>
                  <TextField
                    label={t("shortOutput.startSec")}
                    size="small"
                    value={shortStartSecStr}
                    onChange={(e) => setShortStartSecStr(e.target.value)}
                    disabled={shortOutputPreset === "all"}
                    sx={{ width: 120, "& .MuiInputBase-root": { height: 36 } }}
                    inputProps={{ inputMode: "decimal" }}
                  />
                  <TextField
                    label={t("shortOutput.durationSec")}
                    size="small"
                    value={shortDurationSecStr}
                    onChange={(e) => setShortDurationSecStr(e.target.value)}
                    disabled={shortOutputPreset === "all"}
                    placeholder={
                      shortOutputPreset === "all"
                        ? ""
                        : t("shortOutput.durationPlaceholder", {
                            max: getShortPlatformMaxSec(shortOutputPreset),
                          })
                    }
                    sx={{ width: 140, "& .MuiInputBase-root": { height: 36 } }}
                    inputProps={{ inputMode: "decimal" }}
                  />
                </Box>
                {shortOutputPreset !== "all" && (
                  <Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 0.5, textAlign: "center" }}>
                    {t("shortOutput.hint", { max: getShortPlatformMaxSec(shortOutputPreset) })}
                  </Typography>
                )}
              </div>
            )}

            {settingsTab === 4 && (
              <Box sx={{ width: "100%", maxWidth: 800, margin: "0 auto", py: 1 }}>
                <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                  {t("resolution.title")}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 3 }}>
                  <Button
                    variant={canvasSize === "1920x1080" ? "contained" : "outlined"}
                    onClick={() => onChangeCanvasSize({ target: { value: "1920x1080" } } as SelectChangeEvent<string>)}
                    size="small"
                  >
                    {t("resolution.landscape")}
                  </Button>
                  <Button
                    variant={canvasSize === "1080x1920" ? "contained" : "outlined"}
                    onClick={() => onChangeCanvasSize({ target: { value: "1080x1920" } } as SelectChangeEvent<string>)}
                    size="small"
                  >
                    {t("resolution.portrait")}
                  </Button>
                  <Button
                    variant={canvasSize === "1920x1920" ? "contained" : "outlined"}
                    onClick={() => onChangeCanvasSize({ target: { value: "1920x1920" } } as SelectChangeEvent<string>)}
                    size="small"
                  >
                    {t("resolution.square")}
                  </Button>
                </Box>
                <Divider sx={{ my: 2 }} />
                {isDeveloperMode && (
                  <Box sx={{ mb: 2, p: 1, bgcolor: "background.paper", borderRadius: 1 }}>
                    <Typography variant="body2" color="textSecondary">
                      FPS:{" "}
                      <strong style={{ color: fps >= 55 ? "#4caf50" : fps >= 30 ? "#ff9800" : "#f44336" }}>{fps}</strong>
                    </Typography>
                  </Box>
                )}
                <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                  {t("gpu.title")}
                </Typography>
                <Box sx={{ mb: 3 }}>
                  {gpuInfo && (
                    <Box sx={{ mb: 2, p: 2, bgcolor: "background.paper", borderRadius: 1 }}>
                      <Typography variant="h6" gutterBottom>
                        {t("gpu.detected")}
                      </Typography>
                      <Typography variant="body2" color="textSecondary" gutterBottom>
                        {getGpuDisplayName(gpuInfo)}
                      </Typography>
                      <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                        <Typography
                          variant="caption"
                          sx={{
                            px: 1,
                            py: 0.5,
                            bgcolor: gpuInfo.isWebGL2Supported ? "success.main" : "error.main",
                            color: "white",
                            borderRadius: 1,
                          }}
                        >
                          {t("gpu.webgl2")}: {gpuInfo.isWebGL2Supported ? t("gpu.supported") : t("gpu.unsupported")}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            px: 1,
                            py: 0.5,
                            bgcolor: gpuInfo.isWebGPUSupported ? "success.main" : "warning.main",
                            color: "white",
                            borderRadius: 1,
                          }}
                        >
                          WebGPU: {gpuInfo.isWebGPUSupported ? t("gpu.supported") : t("gpu.unsupported")}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            px: 1,
                            py: 0.5,
                            bgcolor: webCodecsSupported ? "success.main" : "warning.main",
                            color: "white",
                            borderRadius: 1,
                          }}
                        >
                          WebCodecs: {webCodecsSupported ? t("gpu.supported") : t("gpu.unsupported")}
                        </Typography>
                        {webCodecsSupported && hardwareEncoderSupport.h264 && (
                          <Typography
                            variant="caption"
                            sx={{
                              px: 1,
                              py: 0.5,
                              bgcolor: "info.main",
                              color: "white",
                              borderRadius: 1,
                            }}
                          >
                            {t("gpu.h264hw")}
                          </Typography>
                        )}
                      </Box>
                      <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: "block" }}>
                        {t("gpu.vendor", {
                          name:
                            gpuInfo.vendorType === "nvidia"
                              ? "NVIDIA"
                              : gpuInfo.vendorType === "intel"
                                ? "Intel"
                                : gpuInfo.vendorType === "amd"
                                  ? "AMD"
                                  : gpuInfo.vendorType === "apple"
                                    ? "Apple"
                                    : t("gpu.vendorUnknown"),
                        })}
                      </Typography>
                    </Box>
                  )}
                  <Typography variant="body1" gutterBottom fontWeight={500}>
                    {t("gpu.renderEngine")}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                    {t("gpu.renderCaption")}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <Button
                      variant={rendererType === "canvas2d" ? "contained" : "outlined"}
                      onClick={() => {
                        setRendererType("canvas2d");
                        localStorage.setItem("common_rendererType", "canvas2d");
                      }}
                      size="small"
                    >
                      {t("buttons.canvas2d")}
                    </Button>
                    <Button
                      variant={rendererType === "webgl" ? "contained" : "outlined"}
                      onClick={() => {
                        setRendererType("webgl");
                        localStorage.setItem("common_rendererType", "webgl");
                      }}
                      size="small"
                      disabled={!gpuInfo?.isWebGLSupported}
                    >
                      {t("buttons.webgl")}
                    </Button>
                  </Box>
                </Box>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                  {t("settings.title")}
                </Typography>
                <Box sx={{ width: "100%", maxWidth: 600, margin: "0 auto" }}>
                  <Typography variant="body2" gutterBottom>
                    {t("settings.current", { mode, size: canvasSize })}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
                    {t("settings.caption")}
                  </Typography>
                  <Typography variant="subtitle2" gutterBottom>
                    {t("settings.exportImport")}
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
                          openSnackBar(t("snackbar.exportSuccess"));
                        }
                      }}
                    >
                      {t("buttons.export")}
                    </Button>
                    <input
                      type="file"
                      accept=".json,application/json"
                      style={{ display: "none" }}
                      id="import-settings-file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > MAX_SETTINGS_JSON_BYTES) {
                            openSnackBar(
                              t("snackbar.settingsFileTooLarge", {
                                maxMB: Math.round(MAX_SETTINGS_JSON_BYTES / 1024 / 1024),
                              })
                            );
                            e.target.value = "";
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => {
                            const text = reader.result as string;
                            if (importAllSettings(text)) {
                              const loaded = loadSettings(canvasSize, mode);
                              setModeAdjustments(loaded ?? DEFAULT_ADJUSTMENTS);
                              openSnackBar(t("snackbar.importSuccess"));
                            } else {
                              openSnackBar(t("snackbar.importFailed"));
                            }
                          };
                          reader.readAsText(file);
                        }
                        e.target.value = "";
                      }}
                    />
                    <Button variant="outlined" size="small" component="label" htmlFor="import-settings-file">
                      {t("buttons.import")}
                    </Button>
                  </Box>
                  <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: "block" }}>
                    {t("settings.clearAllHint")}{" "}
                    <Button
                      size="small"
                      color="error"
                      onClick={() => {
                        if (confirm(t("settings.clearConfirm"))) {
                          clearAllSettings();
                          setEffectType("none");
                          setEffectDensities(defaultEffectDensities());
                          setRainWeather(DEFAULT_RAIN_WEATHER);
                          setSnowWeather(DEFAULT_SNOW_WEATHER);
                          setTargetLufs(null);
                          setTargetLufsCustom("");
                          setModeAdjustments(DEFAULT_ADJUSTMENTS);
                          openSnackBar(t("snackbar.allCleared"));
                        }
                      }}
                    >
                      {t("buttons.clearAll")}
                    </Button>
                  </Typography>
                </Box>
              </Box>
            )}
          </div>
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
              {isPlaySound ? t("buttons.stop") : t("buttons.preview")}
            </Button>
            <Button
              variant="outlined"
              startIcon={<FiberManualRecord />}
              disabled={recordMovieDisabled || isPlaySound}
              onClick={onRecordMovie}
              size="medium"
            >
              {t("buttons.generateVideo")}
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<DeleteSweep />}
              onClick={onClear}
              size="medium"
              sx={{ ml: 2 }}
            >
              {t("buttons.clear")}
            </Button>
          </Box>
          </div>

          <div className={styles.canvasInfo}>
            <Typography variant="caption" color="textSecondary">
              {t("recordSize", {
              width: getCanvasDimensions(canvasSize).width,
              height: getCanvasDimensions(canvasSize).height,
            })}
            </Typography>
          </div>
        </div>
      </main>

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
