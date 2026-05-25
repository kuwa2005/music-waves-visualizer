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
  Switch,
  FormControlLabel,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import {
  FiberManualRecord,
  ExpandMore,
  LibraryMusic,
  PhotoLibrary,
  VideoLibrary,
  DeleteSweep,
  Warning,
  NavigateBefore,
  NavigateNext,
  Undo,
  Lightbulb,
  LightbulbOutlined,
} from "@mui/icons-material";
import i18n from "i18next";
import { CustomSnackbar } from "../components/CustomSnackbar";
import {
  drawBars,
  clearImageCache,
  getFPS,
  stopCanvas2DAnimation,
  GLYCO_COLOR_SETS,
  GLYCO_GRADIENT_SETS,
  legacySpectrumPresetToHex,
} from "../lib/Canvas";
import { DEFAULT_COLOR_PALETTE_20 } from "../lib/colorPalette";
import {
  startGalleryImageTransition,
  clearGalleryImageTransition,
  GALLERY_TRANSITION_RANDOM_POOL,
  GALLERY_TRANSITION_SELECT_OPTIONS,
  isValidGalleryTransitionUserMode,
  type GalleryTransitionUserMode,
} from "../lib/galleryImageTransition";
import { drawBarsWebGL, getFPSWebGL, cleanupWebGL, stopWebGLAnimation, clearWebGLImageCache } from "../lib/WebGLRenderer";
import type { EffectType, EffectDensity, EffectParams } from "../lib/Effects";
import { getGpuInfo, getGpuDisplayName, type GpuInfo } from "../lib/GpuDetector";
import {
  QuickVideoEncoder,
  analyzeAudioRealtime,
  type QuickEncoderProgress,
  type QuickEncoderConfig
} from "../lib/QuickVideoEncoder";
import { isWebCodecsSupported, checkHardwareEncoderSupport } from "../lib/WebCodecsEncoder";
import { generateMp4Video } from "../lib/Ffmpeg";
import { mwvError, mwvLog, mwvMilestone } from "../lib/mwvConsole";
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
import {
  parseLyricsLinesFromSuno,
  getPlaybackWindowBounds,
  evenSplitCuesInWindow,
  formatSrtFromCues,
  shiftCuesBySeconds,
} from "../lib/srtAuthoring";
import {
  parseSrt,
  DEFAULT_SUBTITLE_STYLE,
  DEFAULT_TITLE_STYLE,
  type SubtitleCue,
  type SubtitleStyle,
  type TitleStyle,
} from "../lib/subtitles";
import { mwvGetItem, mwvSetItem, mwvRemoveItem } from "../lib/mwvCookieStorage";
import {
  parseExplicitDurationSec,
  parseFadeSecStr,
  resetClipGain,
  resolveClipFadeSchedule,
  scheduleClipGainFade,
} from "../lib/clipAudioFade";

type ShortOutputPreset = "all" | "tiktok" | "youtube" | "niconico";
type ExportAudioBitrateKbps = 128 | 192 | 256 | 320;
type ResolvedClip = { full: true } | { full: false; start: number; duration: number };
const MODE_COOKIE_KEY = "mwv_mode";
/** ライト／ダーク UI 切替（`light` | `dark`）。電球点灯＝ライトモード */
const UI_SCHEME_COOKIE = "mwv_ui_scheme";
/** Cookie 上で targetLufs === null（正規化オフ）を表す */
const TARGET_LUFS_NONE_COOKIE = "__none__";

function isExportAudioBitrateKbps(v: number): v is ExportAudioBitrateKbps {
  return v === 128 || v === 192 || v === 256 || v === 320;
}

/** MediaRecorder 用。未指定時は exportAudioBitrateKbps に追従 */
function clampRecordAudioBitsPerSecond(
  exportKbps: number,
  recordKbps: number | null | undefined
): number {
  const effectiveKbps = recordKbps ?? exportKbps;
  return Math.min(512_000, Math.max(128_000, Math.round(effectiveKbps * 1000)));
}
const JP_DEFAULT_FONT_FAMILY = "'Noto Sans JP', sans-serif";
const isJapaneseLang = (lng: string | undefined | null): boolean => {
  const s = (lng ?? "").toLowerCase();
  return s === "ja" || s.startsWith("ja-");
};
const SRT_AUTHOR_TIME_STEP_SEC = 0.01;
const SRT_AUTHOR_TIME_REPEAT_DELAY_MS = 200;
const SRT_AUTHOR_TIME_REPEAT_INTERVAL_MS = 45;
const VIDEO_BACKGROUND_PREVIEW_FPS = 30;
const RECORDING_MAX_FPS = 60;
type SrtAuthorCueTimeKey = "startSec" | "endSec";

function normalizeHexColorInput(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  return raw.startsWith("#") ? raw.toUpperCase() : `#${raw.toUpperCase()}`;
}

function isHexColorCode(value: string): boolean {
  return /^#[0-9A-F]{6}$/.test(value);
}

function isSrtFileByName(name: string): boolean {
  return /\.srt$/i.test(name);
}

function isLyricsTextFileByName(name: string): boolean {
  return /\.(txt|lrc)$/i.test(name);
}

/** タイミング記録の Space: 歌詞入力などのテキスト編集時のみ無視（記録モード Switch の checkbox は対象外） */
function isTypingTargetForSrtAuthorSpaceKey(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) {
    return true;
  }
  if (el.tagName === "INPUT") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase();
    return type !== "checkbox" && type !== "radio";
  }
  return false;
}

type CanvasLayoutKey = "1920x1080" | "1080x1920" | "1920x1920";

function detectLayoutFromAspectRatio(ratio: number): CanvasLayoutKey {
  const candidates: Array<{ layout: CanvasLayoutKey; ratio: number }> = [
    { layout: "1920x1080", ratio: 16 / 9 },
    { layout: "1080x1920", ratio: 9 / 16 },
    { layout: "1920x1920", ratio: 1 },
  ];
  let best = candidates[0];
  let bestDiff = Math.abs(ratio - best.ratio);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const d = Math.abs(ratio - c.ratio);
    if (d < bestDiff) {
      best = c;
      bestDiff = d;
    }
  }
  return best.layout;
}

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split("; ").map((v) => v.trim());
  const hit = parts.find((v) => v.startsWith(`${name}=`));
  if (!hit) return null;
  return decodeURIComponent(hit.slice(name.length + 1));
}

function setCookieValue(name: string, value: string, maxAgeSec: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; samesite=lax`;
}

function buildDownloadBaseName(audioName: string, fallbackBaseName: string): string {
  const trimmed = (audioName ?? "").trim();
  const withoutExt = trimmed.replace(/\.[^.]+$/, "");
  const safeBase = withoutExt
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return safeBase !== "" ? safeBase : fallbackBaseName;
}

function buildDownloadMp4Name(audioName: string, fallbackBaseName: string): string {
  return `${buildDownloadBaseName(audioName, fallbackBaseName)}.mp4`;
}

function buildDownloadSrtName(audioName: string, fallbackBaseName: string): string {
  return `${buildDownloadBaseName(audioName, fallbackBaseName)}.srt`;
}

const hasWindow = () => {
  return typeof window === "object";
};

type GalleryImageEntry = {
  img: HTMLImageElement;
  name: string;
  objectUrl: string;
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
  /** ライト／ダーク。初期は固定でハイドレーション一致（Cookie は useLayoutEffect で適用） */
  const [uiScheme, setUiScheme] = useState<"light" | "dark">("light");
  const [isPlaySound, setIsPlaySound] = useState<boolean>(false);
  /** プレビュー再生の有効判定（state より先に同期し、同一ターン内のタイミング取りに使う） */
  const isPlaySoundRef = useRef(false);
  useEffect(() => {
    isPlaySoundRef.current = isPlaySound;
  }, [isPlaySound]);
  /** プレビュー再生ハンドラ（SRT「開始」などから最新の onPlaySound を同期的に呼ぶ用） */
  const onPlaySoundPlaybackRef = useRef<() => void>(() => {});
  const [playSoundDisabled, setPlaySoundDisabled] = useState<boolean>(true);
  const [recordMovieDisabled, setRecordMovieDisabled] = useState<boolean>(true);
  const [audioFileName, setAudioFileName] = useState<string>("");
  const [subtitleFileName, setSubtitleFileName] = useState<string>("");
  const [subtitleEnabled, setSubtitleEnabled] = useState<boolean>(true);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  /** 字幕表示タイミング補正（秒）。プレビュー/録画の描画のみ。永続化しない */
  const [subtitleDisplayTimingOffsetSec, setSubtitleDisplayTimingOffsetSec] = useState<number>(0);
  /** SRT 作成支援（歌詞貼り付け〜タイミング〜書き出し） */
  const [srtAuthorLyricsRaw, setSrtAuthorLyricsRaw] = useState<string>("");
  const [srtAuthorCues, setSrtAuthorCues] = useState<SubtitleCue[]>([]);
  const [srtAuthorRecordActive, setSrtAuthorRecordActive] = useState<boolean>(false);
  const [srtAuthorPhase, setSrtAuthorPhase] = useState<"wait_start" | "inside_line">("wait_start");
  const [srtAuthorLineIndex, setSrtAuthorLineIndex] = useState<number>(0);
  const [srtAuthorGlobalOffsetMs, setSrtAuthorGlobalOffsetMs] = useState<number>(0);
  const srtAuthorUndoRef = useRef<Array<{ cues: SubtitleCue[]; lineIdx: number; phase: "wait_start" | "inside_line" }>>(
    []
  );
  const srtAuthorLineIndexRef = useRef(0);
  const srtAuthorPhaseRef = useRef<"wait_start" | "inside_line">("wait_start");
  const srtRecordPanelRef = useRef<HTMLDivElement | null>(null);
  const srtAuthorCueListRef = useRef<HTMLDivElement | null>(null);
  const srtAuthorActiveCueRowRef = useRef<HTMLDivElement | null>(null);
  const srtAuthorNextCueRowRef = useRef<HTMLDivElement | null>(null);
  const srtAuthorCuesRef = useRef<SubtitleCue[]>([]);
  const srtAuthorTimeRepeatRef = useRef<{
    timeoutId: ReturnType<typeof setTimeout> | null;
    intervalId: ReturnType<typeof setInterval> | null;
  } | null>(null);
  const [titleText, setTitleText] = useState<string>("");
  const [titleEnabled, setTitleEnabled] = useState<boolean>(true);
  const [titleStyle, setTitleStyle] = useState<TitleStyle>(DEFAULT_TITLE_STYLE);
  const [fps, setFps] = useState<number>(0);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const isRecordingRef = useRef(false);
  const setRecordingActive = useCallback((recording: boolean) => {
    isRecordingRef.current = recording;
    setIsRecording(recording);
  }, []);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // エンコード進捗
  const [encodeStatus, setEncodeStatus] = useState<"idle" | "loading" | "converting">("idle");
  const [encodeProgress, setEncodeProgress] = useState<number>(0);
  // 高速エンコード関連State
  const [isQuickEncoding, setIsQuickEncoding] = useState<boolean>(false);
  const [quickEncodingProgress, setQuickEncodingProgress] = useState<QuickEncoderProgress | null>(null);
  const quickEncoderRef = useRef<QuickVideoEncoder | null>(null);
  const quickEncodeCancelRef = useRef(false);

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

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: uiScheme === "dark" ? "dark" : "light",
        },
      }),
    [uiScheme]
  );

  const toggleUiScheme = useCallback(() => {
    setUiScheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      setCookieValue(UI_SCHEME_COOKIE, next, 60 * 60 * 24 * 365);
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next === "dark");
      }
      return next;
    });
  }, []);

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
  const clipGainRef = useRef<GainNode | null>(null);
  useEffect(() => {
    // AudioContext
    audioCtxRef.current = new AudioContext();

    // AnalyserNode
    const analyserNode = audioCtxRef.current.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserRef.current = analyserNode;

    const clipGain = audioCtxRef.current.createGain();
    clipGain.gain.value = 1;
    clipGainRef.current = clipGain;
    clipGain.connect(analyserNode);
    analyserNode.connect(audioCtxRef.current.destination);
    const steamDest = audioCtxRef.current.createMediaStreamDestination();
    streamDestinationRef.current = steamDest;
    analyserNode.connect(steamDest);
  }, []);

  // ブラウザ言語が日本語なら、日本語フォントをデフォルトに寄せる（保存済みは上書きしない）
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isJapaneseLang(i18n.language)) return;
    const hasSavedSubtitleStyle = mwvGetItem("common_subtitleStyle") != null;
    const hasSavedTitleStyle = mwvGetItem("common_titleStyle") != null;
    if (!hasSavedSubtitleStyle && subtitleStyle.fontFamily === DEFAULT_SUBTITLE_STYLE.fontFamily) {
      const next = { ...subtitleStyle, fontFamily: JP_DEFAULT_FONT_FAMILY };
      setSubtitleStyle(next);
      mwvSetItem("common_subtitleStyle", JSON.stringify(next));
    }
    if (!hasSavedTitleStyle && titleStyle.fontFamily === DEFAULT_TITLE_STYLE.fontFamily) {
      const next = { ...titleStyle, fontFamily: JP_DEFAULT_FONT_FAMILY };
      setTitleStyle(next);
      mwvSetItem("common_titleStyle", JSON.stringify(next));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const audioBufferSrcRef = useRef<AudioBufferSourceNode>(null);
  const decodedAudioBufferRef = useRef<AudioBuffer>(null);
  const audioPlaybackStartCtxTimeRef = useRef<number | null>(null);
  const audioPlaybackOffsetSecRef = useRef<number>(0);
  const videoElementRef = useRef<HTMLVideoElement>(null);
  /** 音声が AudioBuffer のとき、映像のみ別 MP4 を背景にする用 */
  const backgroundOnlyVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaElementSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const playbackWindowTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const getCurrentPlaybackTimeSec = useCallback((): number => {
    if (!isPlaySoundRef.current && !isRecording) return 0;
    const v = videoElementRef.current;
    if (v && Number.isFinite(v.currentTime)) {
      if (!v.paused) {
        return Math.max(0, v.currentTime);
      }
      if (isPlaySoundRef.current && !isRecording) {
        return Math.max(0, v.currentTime);
      }
    }
    if (audioPlaybackStartCtxTimeRef.current != null && audioCtxRef.current) {
      const elapsed = audioCtxRef.current.currentTime - audioPlaybackStartCtxTimeRef.current;
      return Math.max(0, audioPlaybackOffsetSecRef.current + elapsed);
    }
    return 0;
  }, [isRecording]);

  const syncBackgroundOnlyVideo = useCallback(() => {
    const v = backgroundOnlyVideoRef.current;
    const duration = v?.duration ?? 0;
    if (!v || !Number.isFinite(duration) || duration <= 0) return;
    const isAudioTimelineActive =
      isPlaySoundRef.current || (isRecording && audioPlaybackStartCtxTimeRef.current != null);
    const t = getCurrentPlaybackTimeSec();
    const epsilon = Math.min(0.04, duration / 4);
    const start = t <= 0 ? 0 : epsilon;
    const end = Math.max(0, duration - epsilon);
    const looped = ((Math.max(0, t) % duration) + duration) % duration;
    const target = t <= 0 ? 0 : Math.min(Math.max(looped, start), Math.max(start, end));
    const rawDrift = Math.abs(v.currentTime - target);
    const drift = Math.min(rawDrift, Math.max(0, duration - rawDrift));

    if (!isAudioTimelineActive) {
      if (!v.paused) {
        try {
          v.pause();
        } catch {
          /* ignore */
        }
      }
      if (!Number.isFinite(v.currentTime) || Math.abs(v.currentTime) > 0.05) {
        try {
          v.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      return;
    }

    // 背景MP4は通常再生に任せ、デコードを止める currentTime 書き換えは大きなズレだけに限定する。
    const seekThreshold = v.paused ? 0.08 : 0.45;
    if (!v.seeking && drift > seekThreshold) {
      try {
        v.currentTime = target;
      } catch {
        /* ignore */
      }
    }
    if (v.paused) {
      v.play().catch(() => {
        /* ignore */
      });
    }
  }, [getCurrentPlaybackTimeSec, isRecording]);

  const disposeStandaloneBackgroundVideo = useCallback(() => {
    const v = backgroundOnlyVideoRef.current;
    if (!v) return;
    v.onerror = null;
    v.onloadedmetadata = null;
    v.onended = null;
    try {
      v.pause();
    } catch {
      /* ignore */
    }
    if (v.src?.startsWith("blob:")) {
      URL.revokeObjectURL(v.src);
    }
    v.src = "";
    backgroundOnlyVideoRef.current = null;
  }, []);

  useEffect(() => {
    srtAuthorLineIndexRef.current = srtAuthorLineIndex;
  }, [srtAuthorLineIndex]);
  useEffect(() => {
    srtAuthorPhaseRef.current = srtAuthorPhase;
  }, [srtAuthorPhase]);
  useEffect(() => {
    srtAuthorCuesRef.current = srtAuthorCues;
  }, [srtAuthorCues]);

  // 開発者モードフラグ（環境変数で制御）
  const isDeveloperMode =
    process.env.NEXT_PUBLIC_DEVELOPER_MODE === "true" ||
    process.env.NEXT_PUBLIC_DEV_MODE === "true";

  // Mode（セッション用、エクスポート対象外）
  // 初期値は固定でハイドレーション一致（Cookie は useLayoutEffect で読み込み）
  const [mode, setMode] = useState<number>(0);

  // Canvas Size（セッション用、エクスポート対象外）
  type CanvasLayout = "1920x1080" | "1080x1920" | "1920x1920";
  type CanvasSize = CanvasLayout | "auto";
  const [canvasSize, setCanvasSize] = useState<CanvasSize>("auto");
  
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
  /** UI ボタン非表示（描画・保存キー互換は残す） */
  const EFFECT_TYPES_UI_HIDDEN: EffectType[] = ["mirrorBall"];
  const EFFECT_TYPES_STRENGTH_LEGACY_HIDDEN: EffectType[] = [
    "vignette",
    "rainbow",
    "curtain",
    ...EFFECT_TYPES_UI_HIDDEN,
  ];
  const effectTypeForUi = (saved: EffectType): EffectType =>
    EFFECT_TYPES_UI_HIDDEN.includes(saved) ? "none" : saved;
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
    "mirrorBall",
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
  const [shortFadeInSecStr, setShortFadeInSecStr] = useState<string>("0");
  const [shortFadeOutSecStr, setShortFadeOutSecStr] = useState<string>("0");

  type WeatherAdjust = { angleDeg: number; amount: number; color: string };
  const DEFAULT_RAIN_WEATHER: WeatherAdjust = { angleDeg: 22, amount: 0.7, color: "#6ba3ff" };
  const DEFAULT_SNOW_WEATHER: WeatherAdjust = { angleDeg: 10, amount: 0.6, color: "#ffffff" };
  type MirrorBallAdjust = {
    ballX: number;
    ballY: number;
    rotationSpeed: number;
    radius: number;
    facetCount: number;
    sparkle: number;
    beamCount: number;
    beamSpread: number;
    ambient: number;
    specular: number;
    reflectivity: number;
    lightX: number;
    lightY: number;
    lightColor: string;
    lightIntensity: number;
    secondaryEnabled: boolean;
    secondaryX: number;
    secondaryY: number;
    secondaryColor: string;
    secondaryIntensity: number;
    audioSyncRotation: boolean;
  };
  const DEFAULT_MIRROR_BALL: MirrorBallAdjust = {
    ballX: 0.5,
    ballY: 0.28,
    rotationSpeed: 14,
    radius: 0.12,
    facetCount: 32,
    sparkle: 0.6,
    beamCount: 18,
    beamSpread: 26,
    ambient: 0.62,
    specular: 0.72,
    reflectivity: 0.88,
    lightX: 0.5,
    lightY: 0.08,
    lightColor: "#fff8dc",
    lightIntensity: 0.85,
    secondaryEnabled: false,
    secondaryX: 0.18,
    secondaryY: 0.22,
    secondaryColor: "#b4d2ff",
    secondaryIntensity: 0.45,
    audioSyncRotation: false,
  };
  const [rainWeather, setRainWeather] = useState<WeatherAdjust>(DEFAULT_RAIN_WEATHER);
  const [snowWeather, setSnowWeather] = useState<WeatherAdjust>(DEFAULT_SNOW_WEATHER);
  const [mirrorBall, setMirrorBall] = useState<MirrorBallAdjust>(DEFAULT_MIRROR_BALL);

  const [settingsTab, setSettingsTab] = useState(0);
  const [rainColorInput, setRainColorInput] = useState<string>(DEFAULT_RAIN_WEATHER.color.toUpperCase());
  const [snowColorInput, setSnowColorInput] = useState<string>(DEFAULT_SNOW_WEATHER.color.toUpperCase());
  const [mirrorBallLightColorInput, setMirrorBallLightColorInput] = useState<string>(
    DEFAULT_MIRROR_BALL.lightColor.toUpperCase()
  );
  const [mirrorBallSecondaryColorInput, setMirrorBallSecondaryColorInput] = useState<string>(
    DEFAULT_MIRROR_BALL.secondaryColor.toUpperCase()
  );
  const isSpaceEffect = effectType === "space" || effectType === "spaceConstant" || effectType === "spaceAudio";

  // スペクトラム調整
  const [spectrumOpacityPercent, setSpectrumOpacityPercent] = useState<number>(10);  // 透過率0-100%、0=完全表示
  const [lineWidthWaveform, setLineWidthWaveform] = useState<number>(3.2);  // mode1
  const [lineWidthCircle, setLineWidthCircle] = useState<number>(3.2);      // mode2
  const [lineWidthSymWave, setLineWidthSymWave] = useState<number>(3.6);    // mode5
  const [circleRotationRpm, setCircleRotationRpm] = useState<number | null>(null); // mode2: null=OFF, 0=停止
  type LoudnessParams = { gain: number; gamma: number; attack: number; release: number };
  type WmpTrailParams = { trailLength: number; trailDecay: number; additive: number };
  const DEFAULT_LOUDNESS_PARAMS: LoudnessParams = { gain: 1.35, gamma: 0.82, attack: 0.22, release: 0.08 };
  const DEFAULT_WMP_TRAIL_PARAMS: WmpTrailParams = { trailLength: 8, trailDecay: 0.86, additive: 1.0 };
  const defaultLoudnessParamsRef = useRef<LoudnessParams>(DEFAULT_LOUDNESS_PARAMS);
  const WMP_TRAIL_DEFAULTS_BY_MODE: Record<15 | 16, WmpTrailParams> = {
    // mode15: クラシックWMP風に長め残像
    15: { trailLength: 12, trailDecay: 0.92, additive: 1.4 },
    // mode16: 幾何学が潰れにくいよう少し抑えめ
    16: { trailLength: 9, trailDecay: 0.88, additive: 1.2 },
  };
  const WMP_TRAIL_PRESETS: Record<"classic" | "modern", Record<15 | 16, WmpTrailParams>> = {
    classic: {
      15: { trailLength: 14, trailDecay: 0.94, additive: 1.65 },
      16: { trailLength: 11, trailDecay: 0.90, additive: 1.35 },
    },
    modern: {
      15: { trailLength: 8, trailDecay: 0.84, additive: 1.1 },
      16: { trailLength: 6, trailDecay: 0.80, additive: 0.95 },
    },
  };
  const defaultWmpTrailParamsForMode: WmpTrailParams =
    mode === 15 || mode === 16 ? WMP_TRAIL_DEFAULTS_BY_MODE[mode] : DEFAULT_WMP_TRAIL_PARAMS;
  const [loudnessParamsByMode, setLoudnessParamsByMode] = useState<Record<number, LoudnessParams>>({});
  const [wmpTrailParamsByMode, setWmpTrailParamsByMode] = useState<Record<number, WmpTrailParams>>({});
  const LOUDNESS_PRESETS: Record<"natural" | "strong" | "edm", LoudnessParams> = {
    natural: { gain: 1.2, gamma: 0.9, attack: 0.18, release: 0.1 },
    strong: { gain: 1.5, gamma: 0.8, attack: 0.26, release: 0.1 },
    edm: { gain: 1.9, gamma: 0.7, attack: 0.34, release: 0.06 },
  };
  const [glycoColorSet, setGlycoColorSet] = useState<string>("amber");
  const DEFAULT_SPECTRUM_HEX = "#FFFFFF";
  const DEFAULT_SPACE_PARTICLE = "#E0EEFF";
  const DEFAULT_SPARKLE_PARTICLE = "#FFFFFF";
  const DEFAULT_DUST_PARTICLE = "#D8E8FF";
  const [spectrumColorHex, setSpectrumColorHex] = useState<string>(DEFAULT_SPECTRUM_HEX);
  const [spectrumColorInput, setSpectrumColorInput] = useState<string>(DEFAULT_SPECTRUM_HEX);
  const [galleryTransitionMode, setGalleryTransitionMode] =
    useState<GalleryTransitionUserMode>("crossfade");
  const [spaceParticleColor, setSpaceParticleColor] = useState<string>(DEFAULT_SPACE_PARTICLE);
  const [sparkleParticleColor, setSparkleParticleColor] = useState<string>(DEFAULT_SPARKLE_PARTICLE);
  const [dustParticleColor, setDustParticleColor] = useState<string>(DEFAULT_DUST_PARTICLE);
  const [spaceColorInput, setSpaceColorInput] = useState<string>(DEFAULT_SPACE_PARTICLE.toUpperCase());
  const [sparkleColorInput, setSparkleColorInput] = useState<string>(DEFAULT_SPARKLE_PARTICLE.toUpperCase());
  const [dustColorInput, setDustColorInput] = useState<string>(DEFAULT_DUST_PARTICLE.toUpperCase());
  const [spaceDirection, setSpaceDirection] = useState<"forward" | "backward">("forward");
  const [spaceSpeed, setSpaceSpeed] = useState<number>(1);
  const [sparkleVariant, setSparkleVariant] = useState<"normal" | "heart" | "star">("normal");
  const [atmosphereVariant, setAtmosphereVariant] = useState<"dust" | "sparks" | "fireflies">("dust");
  const [atmosphereStrength, setAtmosphereStrength] = useState<number>(45);
  const [spectrumRainbowColorful, setSpectrumRainbowColorful] = useState<boolean>(true);

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
    } else if (effectType === "space" || effectType === "spaceConstant" || effectType === "spaceAudio") {
      base.effectTintColor = spaceParticleColor;
      base.spaceDirection = spaceDirection;
      base.spaceSpeed = spaceSpeed;
    } else if (effectType === "sparkle") {
      base.effectTintColor = sparkleParticleColor;
      base.sparkleVariant = sparkleVariant;
    } else if (effectType === "dust") {
      base.effectTintColor = dustParticleColor;
      base.atmosphereVariant = atmosphereVariant;
      base.effectStrengthScale = Math.max(0.05, Math.min(1, atmosphereStrength / 100));
    } else if (effectType === "mirrorBall") {
      base.mirrorBallX = mirrorBall.ballX;
      base.mirrorBallY = mirrorBall.ballY;
      base.mirrorBallRotationSpeed = mirrorBall.rotationSpeed;
      base.mirrorBallRadius = mirrorBall.radius;
      base.mirrorBallFacetCount = mirrorBall.facetCount;
      base.mirrorBallSparkle = mirrorBall.sparkle;
      base.mirrorBallBeamCount = mirrorBall.beamCount;
      base.mirrorBallBeamSpread = mirrorBall.beamSpread;
      base.mirrorBallAmbient = mirrorBall.ambient;
      base.mirrorBallSpecular = mirrorBall.specular;
      base.mirrorBallReflectivity = mirrorBall.reflectivity;
      base.mirrorBallLightX = mirrorBall.lightX;
      base.mirrorBallLightY = mirrorBall.lightY;
      base.mirrorBallLightColor = mirrorBall.lightColor;
      base.mirrorBallLightIntensity = mirrorBall.lightIntensity;
      base.mirrorBallSecondaryEnabled = mirrorBall.secondaryEnabled;
      base.mirrorBallSecondaryX = mirrorBall.secondaryX;
      base.mirrorBallSecondaryY = mirrorBall.secondaryY;
      base.mirrorBallSecondaryColor = mirrorBall.secondaryColor;
      base.mirrorBallSecondaryIntensity = mirrorBall.secondaryIntensity;
      base.mirrorBallAudioSyncRotation = mirrorBall.audioSyncRotation;
    }
    return base;
  }, [
    effectType,
    effectDensity,
    rainWeather,
    snowWeather,
    spaceParticleColor,
    spaceDirection,
    spaceSpeed,
    sparkleParticleColor,
    sparkleVariant,
    dustParticleColor,
    atmosphereVariant,
    atmosphereStrength,
    mirrorBall,
  ]);

  const [recordVideoBitrateMbps, setRecordVideoBitrateMbps] = useState<number>(8);
  const [exportAudioBitrateKbps, setExportAudioBitrateKbps] = useState<ExportAudioBitrateKbps>(320);
  /** 録画 WebM の音声ビットレート（kbps）。null のとき exportAudioBitrateKbps に追従 */
  const [recordAudioBitrateKbps, setRecordAudioBitrateKbps] = useState<number | null>(384);
  /** 隠し: 字幕タブの SRT 作成支援パネルを表示（設定タブの「SRT」チェックで切替） */
  const [srtAuthorPanelEnabled, setSrtAuthorPanelEnabled] = useState<boolean>(false);

  // 音量設定（共通設定: 目標LUFS、null=正規化なし）
  const [targetLufs, setTargetLufs] = useState<number | null>(-14);
  const [targetLufsCustom, setTargetLufsCustom] = useState<string>("-14");
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (targetLufs != null) mwvSetItem("common_targetLufs", String(targetLufs));
    else mwvSetItem("common_targetLufs", TARGET_LUFS_NONE_COOKIE);
  }, [targetLufs]);

  // 共通設定の保存（音量・エフェクト種類・各エフェクト強度・グライコ色・透過率）
  useEffect(() => {
    if (typeof window === "undefined") return;
    mwvSetItem("common_effectType", effectType);
    mwvSetItem("common_effectDensities", JSON.stringify(effectDensities));
    mwvSetItem("common_glycoColorSet", glycoColorSet);
    mwvSetItem("common_spectrumOpacityPercent", String(spectrumOpacityPercent));
    mwvSetItem("common_spectrumColorHex", spectrumColorHex);
    mwvSetItem("common_galleryTransitionMode", galleryTransitionMode);
    mwvSetItem("common_spaceParticleColor", spaceParticleColor);
    mwvSetItem("common_spaceDirection", spaceDirection);
    mwvSetItem("common_spaceSpeed", String(spaceSpeed));
    mwvSetItem("common_sparkleParticleColor", sparkleParticleColor);
    mwvSetItem("common_sparkleVariant", sparkleVariant);
    mwvSetItem("common_dustParticleColor", dustParticleColor);
    mwvSetItem("common_atmosphereVariant", atmosphereVariant);
    mwvSetItem("common_atmosphereStrength", String(atmosphereStrength));
    mwvSetItem("common_spectrumRainbowColorful", spectrumRainbowColorful ? "1" : "0");
    mwvSetItem(
      "common_circleRotationRpm",
      circleRotationRpm == null ? "off" : String(Math.max(-10, Math.min(10, Math.round(circleRotationRpm))))
    );
    mwvSetItem("common_loudnessParamsByMode", JSON.stringify(loudnessParamsByMode));
    mwvSetItem("common_wmpTrailParamsByMode", JSON.stringify(wmpTrailParamsByMode));
    mwvSetItem("common_subtitleEnabled", subtitleEnabled ? "1" : "0");
    mwvSetItem("common_subtitleStyle", JSON.stringify(subtitleStyle));
    mwvSetItem("common_titleEnabled", titleEnabled ? "1" : "0");
    mwvSetItem("common_titleStyle", JSON.stringify(titleStyle));
    mwvSetItem("common_recordVideoBitrateMbps", String(recordVideoBitrateMbps));
    mwvSetItem("common_exportAudioBitrateKbps", String(exportAudioBitrateKbps));
    if (recordAudioBitrateKbps != null) {
      mwvSetItem("common_recordAudioBitrateKbps", String(recordAudioBitrateKbps));
    } else {
      mwvRemoveItem("common_recordAudioBitrateKbps");
    }
  }, [
    effectType,
    effectDensities,
    glycoColorSet,
    spectrumOpacityPercent,
    spectrumColorHex,
    galleryTransitionMode,
    spaceParticleColor,
    spaceDirection,
    spaceSpeed,
    sparkleParticleColor,
    sparkleVariant,
    dustParticleColor,
    atmosphereVariant,
    atmosphereStrength,
    spectrumRainbowColorful,
    circleRotationRpm,
    loudnessParamsByMode,
    wmpTrailParamsByMode,
    subtitleEnabled,
    subtitleStyle,
    titleEnabled,
    titleStyle,
    recordVideoBitrateMbps,
    exportAudioBitrateKbps,
    recordAudioBitrateKbps,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    mwvSetItem("common_rainWeather", JSON.stringify(rainWeather));
  }, [rainWeather]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    mwvSetItem("common_mirrorBall", JSON.stringify(mirrorBall));
  }, [mirrorBall]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    mwvSetItem("common_snowWeather", JSON.stringify(snowWeather));
  }, [snowWeather]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    mwvSetItem("common_canvasSize", canvasSize);
  }, [canvasSize]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    mwvSetItem("common_settingsTab", String(settingsTab));
  }, [settingsTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    mwvSetItem("common_srtAuthorPanelEnabled", srtAuthorPanelEnabled ? "1" : "0");
  }, [srtAuthorPanelEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    mwvSetItem("common_lineWidthWaveform", String(lineWidthWaveform));
    mwvSetItem("common_lineWidthCircle", String(lineWidthCircle));
    mwvSetItem("common_lineWidthSymWave", String(lineWidthSymWave));
  }, [lineWidthWaveform, lineWidthCircle, lineWidthSymWave]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    mwvSetItem("common_shortOutputPreset", shortOutputPreset);
    mwvSetItem("common_shortStartSecStr", shortStartSecStr);
    mwvSetItem("common_shortDurationSecStr", shortDurationSecStr);
    mwvSetItem("common_shortFadeInSecStr", shortFadeInSecStr);
    mwvSetItem("common_shortFadeOutSecStr", shortFadeOutSecStr);
  }, [shortOutputPreset, shortStartSecStr, shortDurationSecStr, shortFadeInSecStr, shortFadeOutSecStr]);

  const detectCanvasLayoutFromImage = useCallback((image: HTMLImageElement | null): CanvasLayout => {
    if (!image || !(image.naturalWidth > 0) || !(image.naturalHeight > 0)) return "1920x1080";
    const ratio = image.naturalWidth / image.naturalHeight;
    const candidates: Array<{ layout: CanvasLayout; ratio: number }> = [
      { layout: "1920x1080", ratio: 16 / 9 },
      { layout: "1080x1920", ratio: 9 / 16 },
      { layout: "1920x1920", ratio: 1 },
    ];
    let best = candidates[0];
    let bestDiff = Math.abs(ratio - best.ratio);
    candidates.slice(1).forEach((c) => {
      const d = Math.abs(ratio - c.ratio);
      if (d < bestDiff) {
        best = c;
        bestDiff = d;
      }
    });
    return best.layout;
  }, []);

  const resolveCanvasLayout = useCallback(
    (size: CanvasSize, image: HTMLImageElement | null): CanvasLayout => {
      if (size === "auto") return detectCanvasLayoutFromImage(image);
      return size;
    },
    [detectCanvasLayoutFromImage]
  );

  // セッション用: モード（Cookie）
  useEffect(() => {
    if (typeof window === "undefined") return;
    // 1年保存
    setCookieValue(MODE_COOKIE_KEY, String(mode), 60 * 60 * 24 * 365);
  }, [mode]);

  // レイアウト別スペアナ設定のキー（縦/横/正方形 × モード）
  const LAYOUTS: CanvasLayout[] = ["1920x1080", "1080x1920", "1920x1920"];
  const getSettingsKey = useCallback((layout: CanvasLayout, m: number) => {
    return `spectrumSettings_${layout}_${m}`;
  }, []);

  // レイアウト×モードの設定を保存
  const saveSettings = (layout: CanvasLayout, m: number, adjustments: ModeAdjustments) => {
    try {
      const key = getSettingsKey(layout, m);
      mwvSetItem(key, JSON.stringify(adjustments));
    } catch (error) {
      console.error("設定の保存に失敗しました:", error);
    }
  };

  const clampModeAdjustments = useCallback(
    (adj: ModeAdjustments): ModeAdjustments => ({
      scaleX: Math.min(5, Math.max(0.1, adj.scaleX)),
      scaleY: Math.min(5, Math.max(0.1, adj.scaleY)),
      offsetX: Math.min(150, Math.max(-150, Math.round(adj.offsetX))),
      offsetY: Math.min(150, Math.max(-150, Math.round(adj.offsetY))),
    }),
    []
  );

  // レイアウト×モードの設定を読み込み
  const loadSettings = useCallback(
    (layout: CanvasLayout, m: number): ModeAdjustments | null => {
      try {
        const key = getSettingsKey(layout, m);
        const saved = mwvGetItem(key);
        if (saved) {
          return clampModeAdjustments(JSON.parse(saved) as ModeAdjustments);
        }
        // 旧形式のキー（mode_size）にも対応
        const legacyKey = `spectrumSettings_${m}_${layout}`;
        const legacy = mwvGetItem(legacyKey);
        if (legacy) {
          const parsed = JSON.parse(legacy) as ModeAdjustments;
          const clamped = clampModeAdjustments(parsed);
          mwvSetItem(key, JSON.stringify(clamped));
          mwvRemoveItem(legacyKey);
          return clamped;
        }
      } catch (error) {
        console.error("設定の読み込みに失敗しました:", error);
      }
      return null;
    },
    [clampModeAdjustments, getSettingsKey]
  );

  const DEFAULT_ADJUSTMENTS: ModeAdjustments = { scaleX: 1.0, scaleY: 1.0, offsetX: 0, offsetY: 0 };

  // 全設定を一括エクスポート（共通 + 全レイアウト×全モード）
  const exportAllSettings = (): string => {
    const spectrumSettings: Record<string, Record<string, ModeAdjustments>> = {};
    LAYOUTS.forEach((layout) => {
      const layoutData: Record<string, ModeAdjustments> = {};
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].forEach((m) => {
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
        spectrumColorHex,
        spectrumRainbowColorful,
        circleRotationRpm,
        loudnessParamsByMode,
        wmpTrailParamsByMode,
        subtitleEnabled,
        subtitleStyle,
        titleEnabled,
        titleStyle,
        recordVideoBitrateMbps,
        exportAudioBitrateKbps,
        recordAudioBitrateKbps,
        srtAuthorPanelEnabled,
        rendererType,
        rainWeather,
        snowWeather,
        mirrorBall,
        galleryTransitionMode,
        spaceParticleColor,
        spaceDirection,
        spaceSpeed,
        sparkleParticleColor,
        sparkleVariant,
        dustParticleColor,
        atmosphereVariant,
        atmosphereStrength,
        canvasSize,
        settingsTab,
        lineWidthWaveform,
        lineWidthCircle,
        lineWidthSymWave,
        shortOutputPreset,
        shortStartSecStr,
        shortDurationSecStr,
        shortFadeInSecStr,
        shortFadeOutSecStr,
        galleryAutoEnabled,
        galleryAutoSec,
      },
      spectrumSettings,
    };
    return JSON.stringify(output, null, 2);
  };

  // 全設定をクリア（インポート前の一括リセット用）
  const clearAllSettings = () => {
    LAYOUTS.forEach((layout) => {
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].forEach((m) => mwvRemoveItem(getSettingsKey(layout, m)));
    });
    [
      "common_targetLufs",
      "common_effectType",
      "common_effectDensities",
      "common_glycoColorSet",
      "common_spectrumOpacityPercent",
      "common_spectrumColorPreset",
      "common_spectrumCustomHex",
      "common_spectrumColorHex",
      "common_spectrumRainbowColorful",
      "common_circleRotationRpm",
      "common_loudnessParamsByMode",
      "common_wmpTrailParamsByMode",
      "common_subtitleEnabled",
      "common_subtitleStyle",
      "common_titleEnabled",
      "common_titleStyle",
      "common_galleryTransitionMode",
      "common_spaceParticleColor",
      "common_spaceDirection",
      "common_spaceSpeed",
      "common_sparkleParticleColor",
      "common_sparkleVariant",
      "common_dustParticleColor",
      "common_atmosphereVariant",
      "common_atmosphereStrength",
      "common_recordVideoBitrateMbps",
      "common_exportAudioBitrateKbps",
      "common_recordAudioBitrateKbps",
      "common_srtAuthorPanelEnabled",
      "common_rainWeather",
      "common_snowWeather",
      "common_mirrorBall",
      "common_galleryAutoEnabled",
      "common_galleryAutoSec",
      "common_canvasSize",
      "common_settingsTab",
      "common_lineWidthWaveform",
      "common_lineWidthCircle",
      "common_lineWidthSymWave",
      "common_shortOutputPreset",
      "common_shortStartSecStr",
      "common_shortDurationSecStr",
      "common_shortFadeInSecStr",
      "common_shortFadeOutSecStr",
      "common_rendererType",
    ].forEach((k) => mwvRemoveItem(k));
  };

  // 存在する項目のみ上書きインポート
  const importAllSettings = (jsonString: string): boolean => {
    try {
      const data = JSON.parse(jsonString);
      /** common の canvasSize 反映後と同じ基準でスペアナ調整を読む（setState は非同期のため activeCanvasLayout は古いまま） */
      let effectiveCanvasSizeForAdj: CanvasSize = canvasSize;

      // 新形式: common（存在する項目のみ上書き）
      if (data.common) {
        const c = data.common;
        if (c.targetLufs !== undefined) {
          if (c.targetLufs === null) {
            mwvSetItem("common_targetLufs", TARGET_LUFS_NONE_COOKIE);
            setTargetLufs(null);
            setTargetLufsCustom("");
          } else {
            const v = Number(c.targetLufs);
            mwvSetItem("common_targetLufs", String(v));
            setTargetLufs(v);
            setTargetLufsCustom(v === -14 || v === -15 ? "" : String(v));
          }
        }
        if (c.effectType && VALID_SAVED_EFFECT_TYPES.includes(c.effectType)) {
          const resolved = effectTypeForUi(c.effectType);
          mwvSetItem("common_effectType", resolved);
          setEffectType(resolved);
        }
        if (c.effectDensities && typeof c.effectDensities === "object") {
          const merged = { ...effectDensities };
          ALL_EFFECT_STRENGTH_TYPES.forEach((t) => {
            if (c.effectDensities[t] === 1 || c.effectDensities[t] === 2 || c.effectDensities[t] === 3) {
              merged[t] = c.effectDensities[t];
            }
          });
          mwvSetItem("common_effectDensities", JSON.stringify(merged));
          setEffectDensities(merged);
        }
        if (c.glycoColorSet && (GLYCO_COLOR_SETS[c.glycoColorSet] || GLYCO_GRADIENT_SETS[c.glycoColorSet] || c.glycoColorSet === "verticalEQ" || c.glycoColorSet === "verticalEQFixed")) {
          mwvSetItem("common_glycoColorSet", c.glycoColorSet);
          setGlycoColorSet(c.glycoColorSet);
        }
        if (c.spectrumOpacityPercent !== undefined) {
          const v = Number(c.spectrumOpacityPercent);
          if (!isNaN(v) && v >= 0 && v <= 100) {
            mwvSetItem("common_spectrumOpacityPercent", String(v));
            setSpectrumOpacityPercent(v);
          }
        }
        if (typeof c.spectrumColorHex === "string" && /^#[0-9a-fA-F]{6}$/.test(c.spectrumColorHex)) {
          const hx = c.spectrumColorHex.toUpperCase();
          mwvSetItem("common_spectrumColorHex", hx);
          setSpectrumColorHex(hx);
          setSpectrumColorInput(hx);
        } else if (c.spectrumColorPreset != null || typeof c.spectrumCustomHex === "string") {
          const migrated = legacySpectrumPresetToHex(
            c.spectrumColorPreset != null ? String(c.spectrumColorPreset) : "white",
            typeof c.spectrumCustomHex === "string" ? c.spectrumCustomHex : undefined
          );
          mwvSetItem("common_spectrumColorHex", migrated);
          setSpectrumColorHex(migrated);
          setSpectrumColorInput(migrated);
        }
        if (
          c.galleryTransitionMode &&
          isValidGalleryTransitionUserMode(String(c.galleryTransitionMode))
        ) {
          const gm = c.galleryTransitionMode as GalleryTransitionUserMode;
          mwvSetItem("common_galleryTransitionMode", gm);
          setGalleryTransitionMode(gm);
        }
        const applyParticle = (hex: unknown, storageKey: string, setter: (v: string) => void) => {
          if (typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex)) {
            const u = hex.toUpperCase();
            mwvSetItem(storageKey, u);
            setter(u);
          }
        };
        applyParticle(c.spaceParticleColor, "common_spaceParticleColor", setSpaceParticleColor);
        applyParticle(c.sparkleParticleColor, "common_sparkleParticleColor", setSparkleParticleColor);
        applyParticle(c.dustParticleColor, "common_dustParticleColor", setDustParticleColor);
        if (c.spaceDirection === "forward" || c.spaceDirection === "backward") {
          mwvSetItem("common_spaceDirection", c.spaceDirection);
          setSpaceDirection(c.spaceDirection);
        }
        if (typeof c.spaceSpeed === "number") {
          const v = Math.max(0.2, Math.min(3, c.spaceSpeed));
          mwvSetItem("common_spaceSpeed", String(v));
          setSpaceSpeed(v);
        }
        if (c.sparkleVariant === "normal" || c.sparkleVariant === "heart" || c.sparkleVariant === "star") {
          mwvSetItem("common_sparkleVariant", c.sparkleVariant);
          setSparkleVariant(c.sparkleVariant);
        }
        if (c.atmosphereVariant === "dust" || c.atmosphereVariant === "sparks" || c.atmosphereVariant === "fireflies") {
          mwvSetItem("common_atmosphereVariant", c.atmosphereVariant);
          setAtmosphereVariant(c.atmosphereVariant);
        }
        if (typeof c.atmosphereStrength === "number") {
          const v = Math.max(1, Math.min(100, Math.round(c.atmosphereStrength)));
          mwvSetItem("common_atmosphereStrength", String(v));
          setAtmosphereStrength(v);
        }
        if (c.spectrumRainbowColorful === true || c.spectrumRainbowColorful === false) {
          mwvSetItem(
            "common_spectrumRainbowColorful",
            c.spectrumRainbowColorful ? "1" : "0"
          );
          setSpectrumRainbowColorful(c.spectrumRainbowColorful);
        }
        if (c.circleRotationRpm !== undefined) {
          if (c.circleRotationRpm === null || c.circleRotationRpm === "off") {
            mwvSetItem("common_circleRotationRpm", "off");
            setCircleRotationRpm(null);
          } else {
            const n = Number(c.circleRotationRpm);
            if (!isNaN(n)) {
              const clamped = Math.max(-10, Math.min(10, Math.round(n)));
              mwvSetItem("common_circleRotationRpm", String(clamped));
              setCircleRotationRpm(clamped);
            }
          }
        }
        if (c.loudnessParamsByMode && typeof c.loudnessParamsByMode === "object") {
          const src = c.loudnessParamsByMode as Record<string, LoudnessParams>;
          const next: Record<number, LoudnessParams> = {};
          Object.keys(src).forEach((k) => {
            const m = Number(k);
            const v = src[k];
            if (!isNaN(m) && v && typeof v === "object") {
              const gain = Number((v as any).gain);
              const gamma = Number((v as any).gamma);
              const attack = Number((v as any).attack);
              const release = Number((v as any).release);
              if ([gain, gamma, attack, release].every((x) => !isNaN(x))) {
                next[m] = {
                  gain: Math.max(0.1, Math.min(5, gain)),
                  gamma: Math.max(0.2, Math.min(3, gamma)),
                  attack: Math.max(0.01, Math.min(0.9, attack)),
                  release: Math.max(0.01, Math.min(0.9, release)),
                };
              }
            }
          });
          mwvSetItem("common_loudnessParamsByMode", JSON.stringify(next));
          setLoudnessParamsByMode(next);
        }
        if (c.wmpTrailParamsByMode && typeof c.wmpTrailParamsByMode === "object") {
          const src = c.wmpTrailParamsByMode as Record<string, WmpTrailParams>;
          const next: Record<number, WmpTrailParams> = {};
          Object.keys(src).forEach((k) => {
            const m = Number(k);
            const v = src[k];
            if (!isNaN(m) && v && typeof v === "object") {
              const trailLength = Number((v as any).trailLength);
              const trailDecay = Number((v as any).trailDecay);
              const additive = Number((v as any).additive);
              if ([trailLength, trailDecay, additive].every((x) => !isNaN(x))) {
                next[m] = {
                  trailLength: Math.max(2, Math.min(24, Math.round(trailLength))),
                  trailDecay: Math.max(0.5, Math.min(0.99, trailDecay)),
                  additive: Math.max(0.2, Math.min(3, additive)),
                };
              }
            }
          });
          mwvSetItem("common_wmpTrailParamsByMode", JSON.stringify(next));
          setWmpTrailParamsByMode(next);
        }
        if (c.subtitleEnabled === true || c.subtitleEnabled === false) {
          mwvSetItem("common_subtitleEnabled", c.subtitleEnabled ? "1" : "0");
          setSubtitleEnabled(c.subtitleEnabled);
        }
        if (c.subtitleStyle && typeof c.subtitleStyle === "object") {
          const s = c.subtitleStyle as Partial<SubtitleStyle>;
          const next: SubtitleStyle = {
            ...DEFAULT_SUBTITLE_STYLE,
            ...s,
            positionYPercent: Math.max(5, Math.min(98, Number(s.positionYPercent ?? DEFAULT_SUBTITLE_STYLE.positionYPercent))),
            fontSize: Math.max(12, Math.min(96, Number(s.fontSize ?? DEFAULT_SUBTITLE_STYLE.fontSize))),
            strokeWidth: Math.max(0, Math.min(12, Number(s.strokeWidth ?? DEFAULT_SUBTITLE_STYLE.strokeWidth))),
            shadowBlur: Math.max(0, Math.min(30, Number(s.shadowBlur ?? DEFAULT_SUBTITLE_STYLE.shadowBlur))),
            boxPadding: Math.max(0, Math.min(40, Number(s.boxPadding ?? DEFAULT_SUBTITLE_STYLE.boxPadding))),
            animationDurationSec: Math.max(0, Math.min(1.5, Number(s.animationDurationSec ?? DEFAULT_SUBTITLE_STYLE.animationDurationSec))),
          };
          mwvSetItem("common_subtitleStyle", JSON.stringify(next));
          setSubtitleStyle(next);
        }
        if (typeof c.titleText === "string") {
          setTitleText(c.titleText.slice(0, 500));
        }
        if (c.titleEnabled === true || c.titleEnabled === false) {
          mwvSetItem("common_titleEnabled", c.titleEnabled ? "1" : "0");
          setTitleEnabled(c.titleEnabled);
        }
        if (c.titleStyle && typeof c.titleStyle === "object") {
          const s = c.titleStyle as Partial<TitleStyle>;
          const next: TitleStyle = {
            ...DEFAULT_TITLE_STYLE,
            ...s,
            positionYPercent: Math.max(5, Math.min(98, Number(s.positionYPercent ?? DEFAULT_TITLE_STYLE.positionYPercent))),
            fontSize: Math.max(12, Math.min(200, Number(s.fontSize ?? DEFAULT_TITLE_STYLE.fontSize))),
            strokeWidth: Math.max(0, Math.min(12, Number(s.strokeWidth ?? DEFAULT_TITLE_STYLE.strokeWidth))),
            shadowBlur: Math.max(0, Math.min(40, Number(s.shadowBlur ?? DEFAULT_TITLE_STYLE.shadowBlur))),
            boxPadding: Math.max(0, Math.min(40, Number(s.boxPadding ?? DEFAULT_TITLE_STYLE.boxPadding))),
            animationDurationSec: Math.max(0, Math.min(1.5, Number(s.animationDurationSec ?? DEFAULT_TITLE_STYLE.animationDurationSec))),
            letterSpacingPx: Math.max(0, Math.min(24, Number(s.letterSpacingPx ?? DEFAULT_TITLE_STYLE.letterSpacingPx))),
          };
          mwvSetItem("common_titleStyle", JSON.stringify(next));
          setTitleStyle(next);
        }
        if (c.recordVideoBitrateMbps !== undefined) {
          const n = Number(c.recordVideoBitrateMbps);
          if (!isNaN(n) && n >= 1 && n <= 40) {
            mwvSetItem("common_recordVideoBitrateMbps", String(n));
            setRecordVideoBitrateMbps(n);
          }
        }
        if (isExportAudioBitrateKbps(Number(c.exportAudioBitrateKbps))) {
          mwvSetItem("common_exportAudioBitrateKbps", String(c.exportAudioBitrateKbps));
          setExportAudioBitrateKbps(c.exportAudioBitrateKbps);
        }
        if (c.recordAudioBitrateKbps === null) {
          mwvRemoveItem("common_recordAudioBitrateKbps");
          setRecordAudioBitrateKbps(null);
        } else if (c.recordAudioBitrateKbps !== undefined) {
          const rk = Number(c.recordAudioBitrateKbps);
          if (!isNaN(rk) && rk >= 128 && rk <= 512) {
            mwvSetItem("common_recordAudioBitrateKbps", String(rk));
            setRecordAudioBitrateKbps(rk);
          }
        }
        if (c.srtAuthorPanelEnabled === true || c.srtAuthorPanelEnabled === false) {
          mwvSetItem("common_srtAuthorPanelEnabled", c.srtAuthorPanelEnabled ? "1" : "0");
          setSrtAuthorPanelEnabled(c.srtAuthorPanelEnabled);
          if (!c.srtAuthorPanelEnabled) {
            setSrtAuthorRecordActive(false);
          }
        }
        if (c.rendererType === "canvas2d" || c.rendererType === "webgl") {
          // 今後は Canvas2D 固定運用
          mwvSetItem("common_rendererType", "canvas2d");
          setRendererType("canvas2d");
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
        if (c.mirrorBall && typeof c.mirrorBall === "object") {
          const mb = c.mirrorBall as Partial<MirrorBallAdjust>;
          const clamp01 = (v: unknown, fallback: number) =>
            typeof v === "number" && !isNaN(v) ? Math.max(0, Math.min(1, v)) : fallback;
          const clampNum = (v: unknown, min: number, max: number, fallback: number) =>
            typeof v === "number" && !isNaN(v) ? Math.max(min, Math.min(max, v)) : fallback;
          setMirrorBall({
            ballX: clamp01(mb.ballX, DEFAULT_MIRROR_BALL.ballX),
            ballY: clamp01(mb.ballY, DEFAULT_MIRROR_BALL.ballY),
            rotationSpeed: clampNum(mb.rotationSpeed, -180, 180, DEFAULT_MIRROR_BALL.rotationSpeed),
            radius: clampNum(mb.radius, 0.04, 0.35, DEFAULT_MIRROR_BALL.radius),
            facetCount: Math.round(clampNum(mb.facetCount, 8, 64, DEFAULT_MIRROR_BALL.facetCount)),
            sparkle: clamp01(mb.sparkle, DEFAULT_MIRROR_BALL.sparkle),
            beamCount: Math.round(clampNum(mb.beamCount, 4, 32, DEFAULT_MIRROR_BALL.beamCount)),
            beamSpread: clampNum(mb.beamSpread, 8, 90, DEFAULT_MIRROR_BALL.beamSpread),
            ambient: clamp01(mb.ambient, DEFAULT_MIRROR_BALL.ambient),
            specular: clamp01(mb.specular, DEFAULT_MIRROR_BALL.specular),
            reflectivity: clamp01(mb.reflectivity, DEFAULT_MIRROR_BALL.reflectivity),
            lightX: clamp01(mb.lightX, DEFAULT_MIRROR_BALL.lightX),
            lightY: clamp01(mb.lightY, DEFAULT_MIRROR_BALL.lightY),
            lightColor:
              typeof mb.lightColor === "string" && /^#[0-9a-fA-F]{6}$/.test(mb.lightColor)
                ? mb.lightColor
                : DEFAULT_MIRROR_BALL.lightColor,
            lightIntensity: clamp01(mb.lightIntensity, DEFAULT_MIRROR_BALL.lightIntensity),
            secondaryEnabled: mb.secondaryEnabled === true,
            secondaryX: clamp01(mb.secondaryX, DEFAULT_MIRROR_BALL.secondaryX),
            secondaryY: clamp01(mb.secondaryY, DEFAULT_MIRROR_BALL.secondaryY),
            secondaryColor:
              typeof mb.secondaryColor === "string" && /^#[0-9a-fA-F]{6}$/.test(mb.secondaryColor)
                ? mb.secondaryColor
                : DEFAULT_MIRROR_BALL.secondaryColor,
            secondaryIntensity: clamp01(mb.secondaryIntensity, DEFAULT_MIRROR_BALL.secondaryIntensity),
            audioSyncRotation: mb.audioSyncRotation === true,
          });
        }
        if (
          c.canvasSize === "auto" ||
          c.canvasSize === "1920x1080" ||
          c.canvasSize === "1080x1920" ||
          c.canvasSize === "1920x1920"
        ) {
          mwvSetItem("common_canvasSize", c.canvasSize);
          setCanvasSize(c.canvasSize);
          effectiveCanvasSizeForAdj = c.canvasSize;
        }
        if (typeof c.settingsTab === "number" && c.settingsTab >= 0 && c.settingsTab <= 6) {
          mwvSetItem("common_settingsTab", String(c.settingsTab));
          setSettingsTab(c.settingsTab);
        }
        if (typeof c.lineWidthWaveform === "number") {
          const n = c.lineWidthWaveform;
          if (!isNaN(n)) {
            const v = Math.max(1, Math.min(8, n));
            mwvSetItem("common_lineWidthWaveform", String(v));
            setLineWidthWaveform(v);
          }
        }
        if (typeof c.lineWidthCircle === "number") {
          const n = c.lineWidthCircle;
          if (!isNaN(n)) {
            const v = Math.max(1, Math.min(8, n));
            mwvSetItem("common_lineWidthCircle", String(v));
            setLineWidthCircle(v);
          }
        }
        if (typeof c.lineWidthSymWave === "number") {
          const n = c.lineWidthSymWave;
          if (!isNaN(n)) {
            const v = Math.max(1, Math.min(8, n));
            mwvSetItem("common_lineWidthSymWave", String(v));
            setLineWidthSymWave(v);
          }
        }
        if (c.shortOutputPreset === "all" || c.shortOutputPreset === "tiktok" || c.shortOutputPreset === "youtube" || c.shortOutputPreset === "niconico") {
          mwvSetItem("common_shortOutputPreset", c.shortOutputPreset);
          setShortOutputPreset(c.shortOutputPreset);
        }
        if (typeof c.shortStartSecStr === "string") {
          mwvSetItem("common_shortStartSecStr", c.shortStartSecStr);
          setShortStartSecStr(c.shortStartSecStr);
        }
        if (typeof c.shortDurationSecStr === "string") {
          mwvSetItem("common_shortDurationSecStr", c.shortDurationSecStr);
          setShortDurationSecStr(c.shortDurationSecStr);
        }
        if (typeof c.shortFadeInSecStr === "string") {
          mwvSetItem("common_shortFadeInSecStr", c.shortFadeInSecStr);
          setShortFadeInSecStr(c.shortFadeInSecStr);
        }
        if (typeof c.shortFadeOutSecStr === "string") {
          mwvSetItem("common_shortFadeOutSecStr", c.shortFadeOutSecStr);
          setShortFadeOutSecStr(c.shortFadeOutSecStr);
        }
        if (c.galleryAutoEnabled === true || c.galleryAutoEnabled === false) {
          mwvSetItem("common_galleryAutoEnabled", c.galleryAutoEnabled ? "1" : "0");
          setGalleryAutoEnabled(c.galleryAutoEnabled);
        }
        if (typeof c.galleryAutoSec === "number") {
          const n = c.galleryAutoSec;
          if (!isNaN(n) && n >= 2 && n <= 60) {
            mwvSetItem("common_galleryAutoSec", String(n));
            setGalleryAutoSec(n);
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
              if (!isNaN(m) && m >= 0 && m <= 16 && layoutData[mStr]) {
                const adj = layoutData[mStr];
                if (adj && typeof adj.scaleX === "number" && typeof adj.scaleY === "number" && typeof adj.offsetX === "number" && typeof adj.offsetY === "number") {
                  saveSettings(layout, m, clampModeAdjustments(adj as ModeAdjustments));
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
            mwvSetItem("common_targetLufs", TARGET_LUFS_NONE_COOKIE);
            setTargetLufs(null);
            setTargetLufsCustom("");
          } else {
            const v = Number(as.targetLufs);
            mwvSetItem("common_targetLufs", String(v));
            setTargetLufs(v);
            setTargetLufsCustom(v === -14 || v === -15 ? "" : String(v));
          }
        }
        if (as.effectType && VALID_SAVED_EFFECT_TYPES.includes(as.effectType as EffectType)) {
          setEffectType(effectTypeForUi(as.effectType as EffectType));
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
              const aIsLayout = LAYOUTS.includes(a as CanvasLayout);
              const bIsLayout = LAYOUTS.includes(b as CanvasLayout);
              const aIsMode = /^\d+$/.test(a);
              const bIsMode = /^\d+$/.test(b);
              if (aIsMode && bIsLayout) {
                saveSettings(b as CanvasLayout, parseInt(a, 10), val);
              } else if (aIsLayout && bIsMode) {
                saveSettings(a as CanvasLayout, parseInt(b, 10), val);
              }
            }
          }
        }
      });

      const layoutForImportAdj = resolveCanvasLayout(effectiveCanvasSizeForAdj, imageCtx);
      const loaded = loadSettings(layoutForImportAdj, mode);
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
      saveSettings(activeCanvasLayout, mode, newAdjustments);
      return newAdjustments;
    });
  };

  useEffect(() => {
    setRainColorInput(rainWeather.color.toUpperCase());
  }, [rainWeather.color]);

  useEffect(() => {
    setSnowColorInput(snowWeather.color.toUpperCase());
  }, [snowWeather.color]);

  useEffect(() => {
    setMirrorBallLightColorInput(mirrorBall.lightColor.toUpperCase());
  }, [mirrorBall.lightColor]);

  useEffect(() => {
    setMirrorBallSecondaryColorInput(mirrorBall.secondaryColor.toUpperCase());
  }, [mirrorBall.secondaryColor]);

  useEffect(() => {
    setSpaceColorInput(spaceParticleColor.toUpperCase());
  }, [spaceParticleColor]);

  useEffect(() => {
    setSparkleColorInput(sparkleParticleColor.toUpperCase());
  }, [sparkleParticleColor]);

  useEffect(() => {
    setDustColorInput(dustParticleColor.toUpperCase());
  }, [dustParticleColor]);

  const galleryTransitionI18nKey = (mode: GalleryTransitionUserMode): string => {
    const map: Record<GalleryTransitionUserMode, string> = {
      none: "gallery.trNone",
      random: "gallery.trRandom",
      crossfade: "gallery.trCrossfade",
      wipeLeft: "gallery.trWipeLeft",
      wipeRight: "gallery.trWipeRight",
      wipeUp: "gallery.trWipeUp",
      wipeDown: "gallery.trWipeDown",
      iris: "gallery.trIris",
      slideLeft: "gallery.trSlideLeft",
      slideRight: "gallery.trSlideRight",
      slideUp: "gallery.trSlideUp",
      slideDown: "gallery.trSlideDown",
      zoomIn: "gallery.trZoomIn",
      zoomOut: "gallery.trZoomOut",
      checker: "gallery.trChecker",
      venetian: "gallery.trVenetian",
      diagonalWipe: "gallery.trDiagonalWipe",
      flash: "gallery.trFlash",
    };
    return map[mode];
  };

  const paletteGridSx = {
    display: "grid",
    gridTemplateColumns: "repeat(10, 28px)",
    gap: "6px",
    justifyContent: "center",
    mb: 1,
  } as const;

  const isLoudnessMode = (m: number) => m >= 8 && m <= 14;
  const isReactiveVisualMode = (m: number) => (m >= 8 && m <= 14) || m === 15 || m === 16;
  const getModeDescriptionKey = (m: number): string => {
    const map: Record<number, string> = {
      [-1]: "spectrum.descOff",
      0: "spectrum.descFreqBar",
      2: "spectrum.descCircle",
      3: "spectrum.descSymBar",
      4: "spectrum.descDot",
      6: "spectrum.descGlyco",
      7: "spectrum.descAreaFill",
      8: "spectrum.descLoudnessPulse",
      9: "spectrum.descVuMeter",
      10: "spectrum.descPulseRing",
      11: "spectrum.descCenterOrb",
      12: "spectrum.descBreathingBg",
      13: "spectrum.descParticleDensity",
      14: "spectrum.descGeomMorph",
      15: "spectrum.descOscilloscope",
      16: "spectrum.descLissajous",
    };
    return map[m] ?? "spectrum.descOff";
  };

  const onChangeMode = (event: SelectChangeEvent<string>) => {
    const newMode = Number(event.target.value);
    saveSettings(activeCanvasLayout, mode, modeAdjustments);
    setMode(newMode);
    const loaded = loadSettings(activeCanvasLayout, newMode);
    if (loaded) setModeAdjustments(loaded);
  };

  const onChangeCanvasSize = (event: SelectChangeEvent<string>) => {
    const newSize = event.target.value as CanvasSize;
    saveSettings(activeCanvasLayout, mode, modeAdjustments);
    setCanvasSize(newSize);
    const newLayout = resolveCanvasLayout(newSize, imageCtx);
    const loaded = loadSettings(newLayout, mode);
    setModeAdjustments(loaded ?? DEFAULT_ADJUSTMENTS);
  };

  const getCanvasDimensions = useCallback((size: CanvasLayout): { width: number; height: number } => {
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
  }, []);

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageGallery, setImageGallery] = useState<GalleryImageEntry[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryAutoEnabled, setGalleryAutoEnabled] = useState(false);
  const [galleryAutoSec, setGalleryAutoSec] = useState(5);

  /** 背景: なし / 静止画ギャラリー / 単体 MP4 動画 */
  type BackgroundMediaMode = "none" | "stills" | "video";
  const [backgroundMediaMode, setBackgroundMediaMode] = useState<BackgroundMediaMode>("none");
  const [backgroundVideoFileName, setBackgroundVideoFileName] = useState("");
  const [reuseAudioVideoForBackground, setReuseAudioVideoForBackground] = useState(false);
  const [backgroundVideoLayoutCache, setBackgroundVideoLayoutCache] = useState<CanvasLayout | null>(null);
  const [dialogClearGalleryForVideo, setDialogClearGalleryForVideo] = useState(false);
  const pendingVideoBackgroundFileRef = useRef<File | null>(null);
  const [dialogDroppedVideoChoice, setDialogDroppedVideoChoice] = useState(false);
  const [dialogSrtAuthorApplyConfirm, setDialogSrtAuthorApplyConfirm] = useState(false);
  const pendingDroppedVideoChoiceRef = useRef<{
    videoFile: File;
    audioFile: File | null;
    subtitleFile: File | null;
  } | null>(null);
  const [videoBackgroundRepaintNonce, setVideoBackgroundRepaintNonce] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    mwvSetItem("common_galleryAutoEnabled", galleryAutoEnabled ? "1" : "0");
  }, [galleryAutoEnabled]);

  const galleryAutoTimerRef = useRef<number | null>(null);
  const galleryAutoPrevLenRef = useRef(0);
  const imageGalleryLenRef = useRef(0);
  imageGalleryLenRef.current = imageGallery.length;

  /** 2枚目以降を読み込んだタイミングでのみ自動切替をON。1枚以下に戻したらOFF（手動OFFは枚数が増えても維持） */
  useEffect(() => {
    const n = imageGallery.length;
    const prev = galleryAutoPrevLenRef.current;
    if (n >= 2 && prev < 2) {
      setGalleryAutoEnabled(true);
    } else if (n <= 1) {
      setGalleryAutoEnabled(false);
    }
    galleryAutoPrevLenRef.current = n;
  }, [imageGallery.length]);

  const activeGalleryIndex =
    imageGallery.length === 0 ? 0 : Math.min(galleryIndex, imageGallery.length - 1);
  const imageCtx =
    imageGallery.length === 0 ? null : imageGallery[activeGalleryIndex].img;
  const imageFileName =
    imageGallery.length === 0 ? "" : imageGallery[activeGalleryIndex].name;

  const prevGalleryIndexForTransitionRef = useRef<number | null>(null);

  useEffect(() => {
    if (imageGallery.length === 0) {
      setGalleryIndex(0);
      return;
    }
    setGalleryIndex((i) => Math.min(i, imageGallery.length - 1));
  }, [imageGallery.length]);

  useEffect(() => {
    if (imageGallery.length <= 1) {
      prevGalleryIndexForTransitionRef.current =
        imageGallery.length === 0 ? null : activeGalleryIndex;
      clearGalleryImageTransition();
      return;
    }
    const prev = prevGalleryIndexForTransitionRef.current;
    if (prev === null) {
      prevGalleryIndexForTransitionRef.current = activeGalleryIndex;
      return;
    }
    if (prev !== activeGalleryIndex) {
      const from = imageGallery[prev]?.img;
      const to = imageGallery[activeGalleryIndex]?.img;
      if (from && to && galleryTransitionMode !== "none") {
        let kind: (typeof GALLERY_TRANSITION_RANDOM_POOL)[number];
        if (galleryTransitionMode === "random") {
          kind =
            GALLERY_TRANSITION_RANDOM_POOL[
              Math.floor(Math.random() * GALLERY_TRANSITION_RANDOM_POOL.length)
            ]!;
        } else {
          kind = galleryTransitionMode as (typeof GALLERY_TRANSITION_RANDOM_POOL)[number];
        }
        startGalleryImageTransition(from, to, kind);
      }
      prevGalleryIndexForTransitionRef.current = activeGalleryIndex;
    }
  }, [activeGalleryIndex, imageGallery, galleryTransitionMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    mwvSetItem("common_galleryAutoSec", String(galleryAutoSec));
  }, [galleryAutoSec]);

  useEffect(() => {
    if (galleryAutoTimerRef.current != null) {
      window.clearInterval(galleryAutoTimerRef.current);
      galleryAutoTimerRef.current = null;
    }
    if (
      !galleryAutoEnabled ||
      imageGallery.length <= 1 ||
      (!isPlaySound && !isRecording)
    ) {
      return;
    }
    const ms = Math.round(Math.max(2, Math.min(60, galleryAutoSec)) * 1000);
    galleryAutoTimerRef.current = window.setInterval(() => {
      setGalleryIndex((i) => {
        const len = imageGalleryLenRef.current;
        if (len <= 1) return i;
        return (i + 1) % len;
      });
    }, ms);
    return () => {
      if (galleryAutoTimerRef.current != null) {
        window.clearInterval(galleryAutoTimerRef.current);
        galleryAutoTimerRef.current = null;
      }
    };
  }, [
    galleryAutoEnabled,
    galleryAutoSec,
    imageGallery.length,
    isPlaySound,
    isRecording,
  ]);

  const activeCanvasLayout = useMemo(() => {
    if (canvasSize === "auto" && backgroundMediaMode === "video" && backgroundVideoLayoutCache) {
      return backgroundVideoLayoutCache;
    }
    return resolveCanvasLayout(canvasSize, imageCtx);
  }, [
    canvasSize,
    imageCtx,
    backgroundMediaMode,
    backgroundVideoLayoutCache,
    resolveCanvasLayout,
  ]);

  const primeCanvasForVideoElement = useCallback(
    (video: HTMLVideoElement) => {
      if (!canvasRef.current) return;
      const w = video.videoWidth || 1;
      const h = video.videoHeight || 1;
      const layout =
        canvasSize === "auto" ? detectLayoutFromAspectRatio(w / h) : (canvasSize as CanvasLayout);
      const dims = getCanvasDimensions(layout);
      if (canvasRef.current.width !== dims.width || canvasRef.current.height !== dims.height) {
        canvasRef.current.width = dims.width;
        canvasRef.current.height = dims.height;
      }
      clearImageCache();
      clearWebGLImageCache();
      setBackgroundVideoLayoutCache(canvasSize === "auto" ? layout : null);
      const immediateCtx = canvasRef.current.getContext("2d", { alpha: true });
      if (immediateCtx) {
        immediateCtx.fillStyle = "rgba(34, 34, 34, 1.0)";
        immediateCtx.fillRect(0, 0, dims.width, dims.height);
        const scale = Math.max(dims.width / w, dims.height / h);
        const drawW = Math.round(w * scale);
        const drawH = Math.round(h * scale);
        const x = (dims.width - drawW) / 2;
        const y = (dims.height - drawH) / 2;
        immediateCtx.drawImage(video, 0, 0, w, h, x, y, drawW, drawH);
      }
    },
    [canvasSize, getCanvasDimensions]
  );

  const loadVideoAsAudioSource = useCallback(
    (file: File, options?: { visualBackgroundSameElement?: boolean }) => {
      const useVideoAsBackground = options?.visualBackgroundSameElement === true;
      const wasUsingAudioVideoForBackground =
        backgroundMediaMode === "video" && reuseAudioVideoForBackground;
      if (useVideoAsBackground) {
        disposeStandaloneBackgroundVideo();
      }
      setReuseAudioVideoForBackground(false);
      if (useVideoAsBackground || wasUsingAudioVideoForBackground) {
        setBackgroundVideoLayoutCache(null);
      }
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
          const clipGain = clipGainRef.current;
          if (clipGain) {
            source.connect(clipGain);
          } else {
            source.connect(analyserRef.current);
          }

          video.onended = () => {
            isPlaySoundRef.current = false;
            setIsPlaySound(false);
            stopCanvas2DAnimation();
            stopWebGLAnimation();
          };

          setPlaySoundDisabled(false);
          setRecordMovieDisabled(false);
          setAudioFileName(file.name);
          exitConfirmRef.current = true;
          if (options?.visualBackgroundSameElement) {
            setImageGallery((prev) => {
              prev.forEach((p) => URL.revokeObjectURL(p.objectUrl));
              return [];
            });
            setGalleryIndex(0);
            setReuseAudioVideoForBackground(true);
            setBackgroundMediaMode("video");
            setBackgroundVideoFileName(file.name);
            const lay = detectLayoutFromAspectRatio(
              (video.videoWidth || 1) / (video.videoHeight || 1)
            );
            setBackgroundVideoLayoutCache(canvasSize === "auto" ? lay : null);
            primeCanvasForVideoElement(video);
            if (canvasSize === "auto") {
              const loaded = loadSettings(lay, mode);
              setModeAdjustments(loaded ?? { scaleX: 1.0, scaleY: 1.0, offsetX: 0, offsetY: 0 });
            }
          } else {
            if (wasUsingAudioVideoForBackground) {
              setBackgroundMediaMode("none");
              setBackgroundVideoFileName("");
            }
          }
          setVideoBackgroundRepaintNonce((n) => n + 1);
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
    [
      backgroundMediaMode,
      canvasSize,
      disposeStandaloneBackgroundVideo,
      loadSettings,
      mode,
      openSnackBar,
      primeCanvasForVideoElement,
      reuseAudioVideoForBackground,
      snackbarFileGate,
      t,
    ]
  );

  const applyBackgroundMp4File = useCallback(
    (file: File) => {
      const g = gateVideoAsMediaFile(file);
      if (snackbarFileGate(g, "video")) {
        return;
      }
      disposeStandaloneBackgroundVideo();
      const video = document.createElement("video");
      video.preload = "auto";
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.src = URL.createObjectURL(file);
      video.onloadedmetadata = () => {
        try {
          backgroundOnlyVideoRef.current = video;
          setReuseAudioVideoForBackground(false);
          setImageGallery((prev) => {
            prev.forEach((p) => URL.revokeObjectURL(p.objectUrl));
            return [];
          });
          setGalleryIndex(0);
          setBackgroundMediaMode("video");
          setBackgroundVideoFileName(file.name);
          const lay = detectLayoutFromAspectRatio(
            (video.videoWidth || 1) / (video.videoHeight || 1)
          );
          setBackgroundVideoLayoutCache(canvasSize === "auto" ? lay : null);
          primeCanvasForVideoElement(video);
          if (canvasSize === "auto") {
            const loaded = loadSettings(lay, mode);
            setModeAdjustments(loaded ?? { scaleX: 1.0, scaleY: 1.0, offsetX: 0, offsetY: 0 });
          }
          exitConfirmRef.current = true;
          setVideoBackgroundRepaintNonce((n) => n + 1);
          openSnackBar(t("snackbar.videoBackgroundLoaded"));
        } catch (_e) {
          openSnackBar(t("snackbar.videoLoadFailed"));
        }
      };
      video.onerror = () => {
        openSnackBar(t("snackbar.videoLoadFailed"));
      };
    },
    [
      canvasSize,
      disposeStandaloneBackgroundVideo,
      loadSettings,
      mode,
      openSnackBar,
      primeCanvasForVideoElement,
      snackbarFileGate,
      t,
    ]
  );

  const spectrumVideoBackground = useMemo(() => {
    void videoBackgroundRepaintNonce;
    const el =
      backgroundMediaMode === "video"
        ? reuseAudioVideoForBackground
          ? videoElementRef.current
          : backgroundOnlyVideoRef.current
        : null;
    const clearTransparent =
      backgroundMediaMode === "video" &&
      el != null &&
      (el.videoWidth === 0 || el.videoHeight === 0);
    return {
      backgroundVideo: el,
      syncBackgroundVideo:
        backgroundMediaMode === "video" && !reuseAudioVideoForBackground
          ? syncBackgroundOnlyVideo
          : undefined,
      clearBackgroundTransparent: clearTransparent,
    };
  }, [
    backgroundMediaMode,
    reuseAudioVideoForBackground,
    syncBackgroundOnlyVideo,
    videoBackgroundRepaintNonce,
  ]);

  // マウント直後に Cookie から設定を読み込み（useLayoutEffect: 永続化用 useEffect より先に state を確定）
  useLayoutEffect(() => {
    const cookieScheme = getCookieValue(UI_SCHEME_COOKIE);
    const initialScheme: "light" | "dark" = cookieScheme === "dark" ? "dark" : "light";
    setUiScheme(initialScheme);
    document.documentElement.classList.toggle("dark", initialScheme === "dark");

    const savedModeCookie = getCookieValue(MODE_COOKIE_KEY);
    let modeVal = savedModeCookie ? parseInt(savedModeCookie, 10) : 0;
    // UI 非表示のモード（折れ線=1・波形上下対称=5）は周波数バーへ
    if (modeVal === 1 || modeVal === 5) {
      modeVal = 0;
      setCookieValue(MODE_COOKIE_KEY, "0", 60 * 60 * 24 * 365);
    }
    // 音圧系（8〜14）は UI 非表示のため周波数バーへ
    if (modeVal >= 8 && modeVal <= 14) {
      modeVal = 0;
      setCookieValue(MODE_COOKIE_KEY, "0", 60 * 60 * 24 * 365);
    }
    setMode(modeVal);

    const savedCanvas = mwvGetItem("common_canvasSize");
    if (
      savedCanvas === "auto" ||
      savedCanvas === "1920x1080" ||
      savedCanvas === "1080x1920" ||
      savedCanvas === "1920x1920"
    ) {
      setCanvasSize(savedCanvas as CanvasSize);
    }

    const savedSettingsTab = mwvGetItem("common_settingsTab");
    if (savedSettingsTab != null) {
      const n = parseInt(savedSettingsTab, 10);
      if (!isNaN(n) && n >= 0 && n <= 6) setSettingsTab(n);
    }

    const lwW = mwvGetItem("common_lineWidthWaveform");
    if (lwW != null) {
      const n = parseFloat(lwW);
      if (!isNaN(n)) setLineWidthWaveform(Math.max(1, Math.min(8, n)));
    }
    const lwC = mwvGetItem("common_lineWidthCircle");
    if (lwC != null) {
      const n = parseFloat(lwC);
      if (!isNaN(n)) setLineWidthCircle(Math.max(1, Math.min(8, n)));
    }
    const lwS = mwvGetItem("common_lineWidthSymWave");
    if (lwS != null) {
      const n = parseFloat(lwS);
      if (!isNaN(n)) setLineWidthSymWave(Math.max(1, Math.min(8, n)));
    }

    const sop = mwvGetItem("common_shortOutputPreset");
    if (sop === "all" || sop === "tiktok" || sop === "youtube" || sop === "niconico") {
      setShortOutputPreset(sop as ShortOutputPreset);
    }
    const ssStart = mwvGetItem("common_shortStartSecStr");
    if (ssStart != null) setShortStartSecStr(ssStart);
    const sds = mwvGetItem("common_shortDurationSecStr");
    if (sds != null) setShortDurationSecStr(sds);
    const sfi = mwvGetItem("common_shortFadeInSecStr");
    if (sfi != null) setShortFadeInSecStr(sfi);
    const sfo = mwvGetItem("common_shortFadeOutSecStr");
    if (sfo != null) setShortFadeOutSecStr(sfo);

    const gae = mwvGetItem("common_galleryAutoEnabled");
    if (gae === "0") setGalleryAutoEnabled(false);
    else if (gae === "1") setGalleryAutoEnabled(true);

    const savedEffectType = mwvGetItem("common_effectType");
    if (savedEffectType && VALID_SAVED_EFFECT_TYPES.includes(savedEffectType as EffectType)) {
      const resolved = effectTypeForUi(savedEffectType as EffectType);
      setEffectType(resolved);
      if (resolved !== savedEffectType) {
        mwvSetItem("common_effectType", resolved);
      }
    }

    try {
      const savedDensities = mwvGetItem("common_effectDensities");
      if (savedDensities) {
        const parsed = JSON.parse(savedDensities) as Partial<Record<EffectType, EffectDensity>>;
        const result = defaultEffectDensities();
        ALL_EFFECT_STRENGTH_TYPES.forEach((t) => {
          if (parsed[t] === 1 || parsed[t] === 2 || parsed[t] === 3) result[t] = parsed[t];
        });
        setEffectDensities(result);
      }
    } catch (_e) { /* ignore */ }

    const savedGlyco = mwvGetItem("common_glycoColorSet");
    if (savedGlyco && (GLYCO_COLOR_SETS[savedGlyco] || GLYCO_GRADIENT_SETS[savedGlyco] || savedGlyco === "verticalEQ" || savedGlyco === "verticalEQFixed")) {
      setGlycoColorSet(savedGlyco);
    }

    const savedOpacity = mwvGetItem("common_spectrumOpacityPercent");
    if (savedOpacity) {
      const n = parseInt(savedOpacity, 10);
      if (!isNaN(n) && n >= 0 && n <= 100) setSpectrumOpacityPercent(n);
    } else {
      const oldOpacity = mwvGetItem("common_spectrumOpacity");
      if (oldOpacity) {
        const o = parseFloat(oldOpacity);
        if (!isNaN(o) && o >= 0.1 && o <= 1) setSpectrumOpacityPercent(Math.round((1 - o) * 100));
      }
    }

    const savedSpectrumHex = mwvGetItem("common_spectrumColorHex");
    if (savedSpectrumHex && /^#[0-9a-fA-F]{6}$/.test(savedSpectrumHex)) {
      const u = savedSpectrumHex.toUpperCase();
      setSpectrumColorHex(u);
      setSpectrumColorInput(u);
    } else {
      const legacyPreset = mwvGetItem("common_spectrumColorPreset");
      const legacyCustom = mwvGetItem("common_spectrumCustomHex");
      const migrated = legacySpectrumPresetToHex(legacyPreset ?? undefined, legacyCustom ?? undefined);
      setSpectrumColorHex(migrated);
      setSpectrumColorInput(migrated);
    }
    const savedGalTransition = mwvGetItem("common_galleryTransitionMode");
    if (savedGalTransition && isValidGalleryTransitionUserMode(savedGalTransition)) {
      setGalleryTransitionMode(savedGalTransition as GalleryTransitionUserMode);
    }
    const savedSpaceC = mwvGetItem("common_spaceParticleColor");
    if (savedSpaceC && /^#[0-9a-fA-F]{6}$/.test(savedSpaceC)) {
      const u = savedSpaceC.toUpperCase();
      setSpaceParticleColor(u);
      setSpaceColorInput(u);
    }
    const savedSpaceDirection = mwvGetItem("common_spaceDirection");
    if (savedSpaceDirection === "forward" || savedSpaceDirection === "backward") {
      setSpaceDirection(savedSpaceDirection);
    }
    const savedSpaceSpeed = mwvGetItem("common_spaceSpeed");
    if (savedSpaceSpeed != null) {
      const n = parseFloat(savedSpaceSpeed);
      if (!isNaN(n)) setSpaceSpeed(Math.max(0.2, Math.min(3, n)));
    }
    const savedSparkleC = mwvGetItem("common_sparkleParticleColor");
    if (savedSparkleC && /^#[0-9a-fA-F]{6}$/.test(savedSparkleC)) {
      const u = savedSparkleC.toUpperCase();
      setSparkleParticleColor(u);
      setSparkleColorInput(u);
    }
    const savedSparkleVariant = mwvGetItem("common_sparkleVariant");
    if (savedSparkleVariant === "normal" || savedSparkleVariant === "heart" || savedSparkleVariant === "star") {
      setSparkleVariant(savedSparkleVariant);
    }
    const savedDustC = mwvGetItem("common_dustParticleColor");
    if (savedDustC && /^#[0-9a-fA-F]{6}$/.test(savedDustC)) {
      const u = savedDustC.toUpperCase();
      setDustParticleColor(u);
      setDustColorInput(u);
    }
    const savedAtmosphereVariant = mwvGetItem("common_atmosphereVariant");
    if (savedAtmosphereVariant === "dust" || savedAtmosphereVariant === "sparks" || savedAtmosphereVariant === "fireflies") {
      setAtmosphereVariant(savedAtmosphereVariant);
    }
    const savedAtmosphereStrength = mwvGetItem("common_atmosphereStrength");
    if (savedAtmosphereStrength != null) {
      const n = parseInt(savedAtmosphereStrength, 10);
      if (!isNaN(n)) setAtmosphereStrength(Math.max(1, Math.min(100, n)));
    }
    const savedRainbow = mwvGetItem("common_spectrumRainbowColorful");
    if (savedRainbow === "0") setSpectrumRainbowColorful(false);
    else if (savedRainbow === "1") setSpectrumRainbowColorful(true);
    const savedCircleRotation = mwvGetItem("common_circleRotationRpm");
    if (savedCircleRotation != null) {
      if (savedCircleRotation === "off") {
        setCircleRotationRpm(null);
      } else {
        const n = Number(savedCircleRotation);
        if (!isNaN(n)) {
          setCircleRotationRpm(Math.max(-10, Math.min(10, Math.round(n))));
        }
      }
    }

    try {
      const savedLp = mwvGetItem("common_loudnessParamsByMode");
      if (savedLp) {
        const parsed = JSON.parse(savedLp) as Record<string, LoudnessParams>;
        const next: Record<number, LoudnessParams> = {};
        Object.keys(parsed).forEach((k) => {
          const m = Number(k);
          const v = parsed[k];
          if (!isNaN(m) && v && typeof v === "object") {
            const gain = Number(v.gain);
            const gamma = Number(v.gamma);
            const attack = Number(v.attack);
            const release = Number(v.release);
            if ([gain, gamma, attack, release].every((x) => !isNaN(x))) {
              next[m] = {
                gain: Math.max(0.1, Math.min(5, gain)),
                gamma: Math.max(0.2, Math.min(3, gamma)),
                attack: Math.max(0.01, Math.min(0.9, attack)),
                release: Math.max(0.01, Math.min(0.9, release)),
              };
            }
          }
        });
        setLoudnessParamsByMode(next);
      }
    } catch (_e) { /* ignore */ }
    try {
      const savedWmp = mwvGetItem("common_wmpTrailParamsByMode");
      if (savedWmp) {
        const parsed = JSON.parse(savedWmp) as Record<string, WmpTrailParams>;
        const next: Record<number, WmpTrailParams> = {};
        Object.keys(parsed).forEach((k) => {
          const m = Number(k);
          const v = parsed[k];
          if (!isNaN(m) && v && typeof v === "object") {
            const trailLength = Number(v.trailLength);
            const trailDecay = Number(v.trailDecay);
            const additive = Number(v.additive);
            if ([trailLength, trailDecay, additive].every((x) => !isNaN(x))) {
              next[m] = {
                trailLength: Math.max(2, Math.min(24, Math.round(trailLength))),
                trailDecay: Math.max(0.5, Math.min(0.99, trailDecay)),
                additive: Math.max(0.2, Math.min(3, additive)),
              };
            }
          }
        });
        setWmpTrailParamsByMode(next);
      }
    } catch (_e) { /* ignore */ }
    const savedSubEnabled = mwvGetItem("common_subtitleEnabled");
    if (savedSubEnabled === "0") setSubtitleEnabled(false);
    else if (savedSubEnabled === "1") setSubtitleEnabled(true);
    try {
      const savedSubStyle = mwvGetItem("common_subtitleStyle");
      if (savedSubStyle) {
        const s = JSON.parse(savedSubStyle) as Partial<SubtitleStyle>;
        setSubtitleStyle({
          ...DEFAULT_SUBTITLE_STYLE,
          ...s,
          positionYPercent: Math.max(5, Math.min(98, Number(s.positionYPercent ?? DEFAULT_SUBTITLE_STYLE.positionYPercent))),
          fontSize: Math.max(12, Math.min(96, Number(s.fontSize ?? DEFAULT_SUBTITLE_STYLE.fontSize))),
          strokeWidth: Math.max(0, Math.min(12, Number(s.strokeWidth ?? DEFAULT_SUBTITLE_STYLE.strokeWidth))),
          shadowBlur: Math.max(0, Math.min(30, Number(s.shadowBlur ?? DEFAULT_SUBTITLE_STYLE.shadowBlur))),
          boxPadding: Math.max(0, Math.min(40, Number(s.boxPadding ?? DEFAULT_SUBTITLE_STYLE.boxPadding))),
          animationDurationSec: Math.max(0, Math.min(1.5, Number(s.animationDurationSec ?? DEFAULT_SUBTITLE_STYLE.animationDurationSec))),
        });
      }
    } catch (_e) { /* ignore */ }

    const savedTitleEnabled = mwvGetItem("common_titleEnabled");
    if (savedTitleEnabled === "0") setTitleEnabled(false);
    else if (savedTitleEnabled === "1") setTitleEnabled(true);
    try {
      const savedTitleStyle = mwvGetItem("common_titleStyle");
      if (savedTitleStyle) {
        const s = JSON.parse(savedTitleStyle) as Partial<TitleStyle>;
        setTitleStyle({
          ...DEFAULT_TITLE_STYLE,
          ...s,
          positionYPercent: Math.max(5, Math.min(98, Number(s.positionYPercent ?? DEFAULT_TITLE_STYLE.positionYPercent))),
          fontSize: Math.max(12, Math.min(200, Number(s.fontSize ?? DEFAULT_TITLE_STYLE.fontSize))),
          strokeWidth: Math.max(0, Math.min(12, Number(s.strokeWidth ?? DEFAULT_TITLE_STYLE.strokeWidth))),
          shadowBlur: Math.max(0, Math.min(40, Number(s.shadowBlur ?? DEFAULT_TITLE_STYLE.shadowBlur))),
          boxPadding: Math.max(0, Math.min(40, Number(s.boxPadding ?? DEFAULT_TITLE_STYLE.boxPadding))),
          animationDurationSec: Math.max(0, Math.min(1.5, Number(s.animationDurationSec ?? DEFAULT_TITLE_STYLE.animationDurationSec))),
          letterSpacingPx: Math.max(0, Math.min(24, Number(s.letterSpacingPx ?? DEFAULT_TITLE_STYLE.letterSpacingPx))),
        });
      }
    } catch (_e) { /* ignore */ }

    const savedVidBr = mwvGetItem("common_recordVideoBitrateMbps");
    if (savedVidBr) {
      const n = parseFloat(savedVidBr);
      if (!isNaN(n) && n >= 1 && n <= 40) setRecordVideoBitrateMbps(n);
    }
    const savedAudBr = mwvGetItem("common_exportAudioBitrateKbps");
    if (savedAudBr != null && savedAudBr !== "") {
      const ak = Number(savedAudBr);
      if (isExportAudioBitrateKbps(ak)) setExportAudioBitrateKbps(ak);
    }
    const savedRecAudBr = mwvGetItem("common_recordAudioBitrateKbps");
    if (savedRecAudBr != null && savedRecAudBr !== "") {
      const rk = Number(savedRecAudBr);
      if (!isNaN(rk) && rk >= 128 && rk <= 512) setRecordAudioBitrateKbps(rk);
    }
    const savedSrtPanel = mwvGetItem("common_srtAuthorPanelEnabled");
    if (savedSrtPanel === "1") {
      setSrtAuthorPanelEnabled(true);
    }

    const rawTl = mwvGetItem("common_targetLufs");
    if (rawTl === TARGET_LUFS_NONE_COOKIE) {
      setTargetLufs(null);
      setTargetLufsCustom("");
    } else if (rawTl != null && rawTl !== "") {
      const v = Number(rawTl);
      if (!isNaN(v)) {
        setTargetLufs(v);
        setTargetLufsCustom(v === -14 || v === -15 ? "" : String(v));
      }
    } else {
      setTargetLufs(-14);
      setTargetLufsCustom("-14");
    }

    const savedGalSec = mwvGetItem("common_galleryAutoSec");
    if (savedGalSec) {
      const n = parseFloat(savedGalSec);
      if (!isNaN(n) && n >= 2 && n <= 60) setGalleryAutoSec(n);
    }

    // 今後は Canvas2D 固定運用
    mwvSetItem("common_rendererType", "canvas2d");
    setRendererType("canvas2d");

    try {
      const rw = mwvGetItem("common_rainWeather");
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
      const sw = mwvGetItem("common_snowWeather");
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

    try {
      const mb = mwvGetItem("common_mirrorBall");
      if (mb) {
        const p = JSON.parse(mb) as Partial<MirrorBallAdjust>;
        const clamp01 = (v: unknown, fallback: number) =>
          typeof v === "number" && !isNaN(v) ? Math.max(0, Math.min(1, v)) : fallback;
        const clampNum = (v: unknown, min: number, max: number, fallback: number) =>
          typeof v === "number" && !isNaN(v) ? Math.max(min, Math.min(max, v)) : fallback;
        setMirrorBall({
          ballX: clamp01(p.ballX, DEFAULT_MIRROR_BALL.ballX),
          ballY: clamp01(p.ballY, DEFAULT_MIRROR_BALL.ballY),
          rotationSpeed: clampNum(p.rotationSpeed, -180, 180, DEFAULT_MIRROR_BALL.rotationSpeed),
          radius: clampNum(p.radius, 0.04, 0.35, DEFAULT_MIRROR_BALL.radius),
          facetCount: Math.round(clampNum(p.facetCount, 8, 64, DEFAULT_MIRROR_BALL.facetCount)),
          sparkle: clamp01(p.sparkle, DEFAULT_MIRROR_BALL.sparkle),
          beamCount: Math.round(clampNum(p.beamCount, 4, 32, DEFAULT_MIRROR_BALL.beamCount)),
          beamSpread: clampNum(p.beamSpread, 8, 90, DEFAULT_MIRROR_BALL.beamSpread),
          ambient: clamp01(p.ambient, DEFAULT_MIRROR_BALL.ambient),
          specular: clamp01(p.specular, DEFAULT_MIRROR_BALL.specular),
          reflectivity: clamp01(p.reflectivity, DEFAULT_MIRROR_BALL.reflectivity),
          lightX: clamp01(p.lightX, DEFAULT_MIRROR_BALL.lightX),
          lightY: clamp01(p.lightY, DEFAULT_MIRROR_BALL.lightY),
          lightColor:
            typeof p.lightColor === "string" && /^#[0-9a-fA-F]{6}$/.test(p.lightColor)
              ? p.lightColor
              : DEFAULT_MIRROR_BALL.lightColor,
          lightIntensity: clamp01(p.lightIntensity, DEFAULT_MIRROR_BALL.lightIntensity),
          secondaryEnabled: p.secondaryEnabled === true,
          secondaryX: clamp01(p.secondaryX, DEFAULT_MIRROR_BALL.secondaryX),
          secondaryY: clamp01(p.secondaryY, DEFAULT_MIRROR_BALL.secondaryY),
          secondaryColor:
            typeof p.secondaryColor === "string" && /^#[0-9a-fA-F]{6}$/.test(p.secondaryColor)
              ? p.secondaryColor
              : DEFAULT_MIRROR_BALL.secondaryColor,
          secondaryIntensity: clamp01(p.secondaryIntensity, DEFAULT_MIRROR_BALL.secondaryIntensity),
          audioSyncRotation: p.audioSyncRotation === true,
        });
      }
    } catch (_e) { /* ignore */ }

    // スペアナ表示調整はレイアウト×モード別に Cookie 保存。復元は保存済み canvasSize に合わせたレイアウトで行う（1920x1080 固定だと縦/正方形で常にズレる）
    const canvasForAdj: CanvasSize =
      savedCanvas === "auto" ||
      savedCanvas === "1920x1080" ||
      savedCanvas === "1080x1920" ||
      savedCanvas === "1920x1920"
        ? (savedCanvas as CanvasSize)
        : "auto";
    const layoutForAdj = resolveCanvasLayout(canvasForAdj, null);
    const adj = loadSettings(layoutForAdj, modeVal);
    if (adj) setModeAdjustments(adj);

    mwvRemoveItem("common_titleText");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GPU情報取得・初回はベンチマークで高速なレンダラーを自動選択
  useEffect(() => {
    const initGpu = async () => {
      const info = getGpuInfo();
      setGpuInfo(info);

      mwvSetItem("common_rendererType", "canvas2d");
      setRendererType("canvas2d");

      const webCodecsAvailable = isWebCodecsSupported();
      setWebCodecsSupported(webCodecsAvailable);

      if (webCodecsAvailable) {
        const encoderSupport = await checkHardwareEncoderSupport();
        setHardwareEncoderSupport(encoderSupport);
      }
    };

    initGpu();
  }, []);

  useEffect(() => {
    if (
      rendererType === "webgl" &&
      ((subtitleEnabled && subtitleCues.length > 0) || (titleEnabled && titleText.trim().length > 0))
    ) {
      setRendererType("canvas2d");
      mwvSetItem("common_rendererType", "canvas2d");
      openSnackBar(t("snackbar.subtitleCanvasFallback"));
    }
  }, [rendererType, subtitleEnabled, subtitleCues.length, titleEnabled, titleText, openSnackBar, t]);

  useEffect(() => {
    if (backgroundMediaMode !== "video" || rendererType !== "webgl") {
      return;
    }
    setRendererType("canvas2d");
    mwvSetItem("common_rendererType", "canvas2d");
    openSnackBar(t("snackbar.videoBackgroundCanvasFallback"));
  }, [backgroundMediaMode, rendererType, openSnackBar, t]);

  // Canvas サイズ設定（canvasSize または rendererType が変更されたときに実行）
  // useLayoutEffectを使用してDOM更新直後にサイズを設定
  useLayoutEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const dimensions = getCanvasDimensions(activeCanvasLayout);
    canvasRef.current.width = dimensions.width;
    canvasRef.current.height = dimensions.height;

    // キャンバスサイズ変更時に画像キャッシュをクリア（両方のレンダラー）
    clearImageCache();
    clearWebGLImageCache();
  }, [activeCanvasLayout, rendererType, getCanvasDimensions]);

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
      lineWidthWaveform,
      lineWidthCircle,
      lineWidthSymWave,
      circleRotationRpm,
      loudnessParams: loudnessParamsByMode[mode] ?? defaultLoudnessParamsRef.current,
      wmpTrailParams: wmpTrailParamsByMode[mode] ?? defaultWmpTrailParamsForMode,
      glycoColorSet,
      spectrumColorHex,
      spectrumRainbowColorful,
      subtitleOverlay: {
        enabled: subtitleEnabled,
        cues: subtitleCues,
        getCurrentTimeSec: getCurrentPlaybackTimeSec,
        style: subtitleStyle,
        displayTimingOffsetSec: subtitleDisplayTimingOffsetSec,
      },
      titleOverlay: {
        enabled: titleEnabled,
        text: titleText,
        style: titleStyle,
        isPlaying: isPlaySound || isRecording,
        playbackTimeSec: getCurrentPlaybackTimeSec(),
      },
      getTargetFps: () => {
        if (isRecordingRef.current) return RECORDING_MAX_FPS;
        if (backgroundMediaMode === "video") return VIDEO_BACKGROUND_PREVIEW_FPS;
        return null;
      },
      ...spectrumVideoBackground,
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
    activeCanvasLayout,
    imageCtx,
    mode,
    modeAdjustments,
    rendererType,
    effectForCanvas,
    isPlaySound,
    isRecording,
    glycoColorSet,
    spectrumOpacityPercent,
    lineWidthWaveform,
    lineWidthCircle,
    lineWidthSymWave,
    circleRotationRpm,
    loudnessParamsByMode,
    defaultWmpTrailParamsForMode,
    wmpTrailParamsByMode,
    spectrumColorHex,
    spectrumRainbowColorful,
    subtitleEnabled,
    subtitleCues,
    subtitleStyle,
    subtitleDisplayTimingOffsetSec,
    titleEnabled,
    titleText,
    titleStyle,
    getCurrentPlaybackTimeSec,
    backgroundMediaMode,
    spectrumVideoBackground,
  ]);

  // FPS表示更新（1秒ごとに更新）
  useEffect(() => {
    if (!isDeveloperMode) {
      return;
    }
    const fpsInterval = setInterval(() => {
      // レンダラータイプに応じてFPSを取得
      const nextFps = rendererType === 'webgl' ? getFPSWebGL() : getFPS();
      setFps((prev) => (prev === nextFps ? prev : nextFps));
    }, 1000);
    return () => clearInterval(fpsInterval);
  }, [isDeveloperMode, rendererType]);

  const primeCanvasForImage = (image: HTMLImageElement) => {
    if (!canvasRef.current) return;
    const resolvedLayout = resolveCanvasLayout(canvasSize, image);
    const dims = getCanvasDimensions(resolvedLayout);
    if (canvasRef.current.width !== dims.width || canvasRef.current.height !== dims.height) {
      canvasRef.current.width = dims.width;
      canvasRef.current.height = dims.height;
    }
    clearImageCache();
    clearWebGLImageCache();
    const immediateCtx = canvasRef.current.getContext("2d", { alpha: true });
    if (immediateCtx) {
      immediateCtx.fillStyle = "rgba(34, 34, 34, 1.0)";
      immediateCtx.fillRect(0, 0, dims.width, dims.height);
      const rawW = image.naturalWidth || image.width || 1;
      const rawH = image.naturalHeight || image.height || 1;
      const scale = Math.max(dims.width / rawW, dims.height / rawH);
      const drawW = Math.round(rawW * scale);
      const drawH = Math.round(rawH * scale);
      const x = (dims.width - drawW) / 2;
      const y = (dims.height - drawH) / 2;
      immediateCtx.drawImage(image, 0, 0, rawW, rawH, x, y, drawW, drawH);
    }
  };

  /** replaceAll: 一覧を差し替え（複数枚は先頭でキャンバス確定後に連結）。false: 空なら新規、既存があれば追加 */
  const loadGalleryImagesFromFiles = (files: File[], replaceAll: boolean) => {
    if (backgroundMediaMode === "video") {
      openSnackBar(t("snackbar.stillsBlockedInVideoBg"));
      return;
    }
    setBackgroundMediaMode("stills");
    const valid: File[] = [];
    for (const file of files) {
      if (isVideoFileByName(file.name)) {
        openSnackBar(t("snackbar.imageVideoNotAllowed"));
        continue;
      }
      if (!isImageFileByName(file.name)) {
        openSnackBar(t("snackbar.imageTypeNotSupported"));
        continue;
      }
      const gi = gateImageFile(file);
      if (snackbarFileGate(gi, "image")) continue;
      valid.push(file);
    }
    if (valid.length === 0) return;

    let idx = 0;
    const loadNext = () => {
      if (idx >= valid.length) {
        if (valid.length > 1) {
          openSnackBar(t("snackbar.imagesLoadedCount", { count: valid.length }));
        } else {
          openSnackBar(t("snackbar.imageLoaded"));
        }
        return;
      }
      const file = valid[idx];
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        if (!canvasRef.current) {
          URL.revokeObjectURL(objectUrl);
          idx++;
          loadNext();
          return;
        }
        const entry: GalleryImageEntry = { img: image, name: file.name, objectUrl };

        if (replaceAll) {
          if (idx === 0) {
            primeCanvasForImage(image);
            setImageGallery((prev) => {
              prev.forEach((p) => URL.revokeObjectURL(p.objectUrl));
              return [entry];
            });
            setGalleryIndex(0);
            const resolvedLayout = resolveCanvasLayout(canvasSize, image);
            if (canvasSize === "auto") {
              const loaded = loadSettings(resolvedLayout, mode);
              setModeAdjustments(loaded ?? DEFAULT_ADJUSTMENTS);
            }
          } else {
            setImageGallery((prev) => [...prev, entry]);
            setGalleryIndex(idx);
          }
        } else {
          setImageGallery((prev) => {
            if (prev.length === 0) {
              primeCanvasForImage(image);
              const resolvedLayout = resolveCanvasLayout(canvasSize, image);
              if (canvasSize === "auto") {
                const loaded = loadSettings(resolvedLayout, mode);
                setModeAdjustments(loaded ?? DEFAULT_ADJUSTMENTS);
              }
              setGalleryIndex(0);
              return [entry];
            }
            const next = [...prev, entry];
            setGalleryIndex(next.length - 1);
            return next;
          });
        }

        exitConfirmRef.current = true;
        idx++;
        loadNext();
      };
      image.onerror = (e) => {
        console.error("画像の読み込みに失敗しました:", e);
        URL.revokeObjectURL(objectUrl);
        openSnackBar(t("snackbar.imageLoadFailed"));
        idx++;
        loadNext();
      };
      image.src = objectUrl;
    };
    loadNext();
  };

  // 音楽読み込み処理（共通）
  const loadAudioFile = async (file: File) => {
    const ga = gateAudioFile(file);
    if (snackbarFileGate(ga, "audio")) {
      return;
    }
    try {
      const wasUsingAudioVideoForBackground =
        backgroundMediaMode === "video" && reuseAudioVideoForBackground;
      if (videoElementRef.current) {
        videoElementRef.current.onerror = null;
        videoElementRef.current.onloadedmetadata = null;
        videoElementRef.current.onended = null;
        try {
          videoElementRef.current.pause();
        } catch {
          /* ignore */
        }
        if (videoElementRef.current.src?.startsWith("blob:")) {
          URL.revokeObjectURL(videoElementRef.current.src);
        }
        videoElementRef.current.src = "";
        videoElementRef.current = null;
      }
      mediaElementSourceRef.current?.disconnect();
      mediaElementSourceRef.current = null;
      setReuseAudioVideoForBackground(false);
      if (wasUsingAudioVideoForBackground) {
        setBackgroundMediaMode("none");
        setBackgroundVideoFileName("");
        setBackgroundVideoLayoutCache(null);
      }
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

  const loadSubtitleFile = async (file: File) => {
    try {
      const text = await file.text();
      const cues = parseSrt(text);
      if (cues.length === 0) {
        openSnackBar(t("snackbar.subtitleParseFailed"));
        return;
      }
      setSubtitleCues(cues);
      setSubtitleFileName(file.name);
      setSubtitleEnabled(true);
      if (srtAuthorPanelEnabled) {
        const authorCues = cues.map((cue) => ({ ...cue }));
        setSrtAuthorCues(authorCues);
        setSrtAuthorLyricsRaw(authorCues.map((cue) => cue.text.replace(/\n+/g, " ").trim()).join("\n"));
        setSrtAuthorLineIndex(0);
        setSrtAuthorPhase("wait_start");
        setSrtAuthorRecordActive(false);
        setDialogSrtAuthorApplyConfirm(false);
        srtAuthorUndoRef.current = [];
        srtAuthorCuesRef.current = authorCues;
        srtAuthorLineIndexRef.current = 0;
        srtAuthorPhaseRef.current = "wait_start";
      }
      openSnackBar(t("snackbar.subtitleLoaded", { count: cues.length }));
      if (rendererType === "webgl") {
        setRendererType("canvas2d");
        mwvSetItem("common_rendererType", "canvas2d");
        openSnackBar(t("snackbar.subtitleCanvasFallback"));
      }
    } catch (_e) {
      openSnackBar(t("snackbar.subtitleLoadFailed"));
    }
  };

  // 画像ボタンから読み込み（複数選択で一括登録・差し替え）
  const imageLoad = (event: { target: HTMLInputElement }) => {
    const raw = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (raw.length === 0) return;

    const videos = raw.filter((f) => isVideoFileByName(f.name));
    const images = raw.filter((f) => isImageFileByName(f.name) && !isVideoFileByName(f.name));
    if (raw.length !== videos.length + images.length) {
      openSnackBar(t("snackbar.imageTypeNotSupported"));
      return;
    }
    if (videos.length > 0 && images.length > 0) {
      openSnackBar(t("snackbar.mixedMp4AndImages"));
      return;
    }
    if (videos.length > 1) {
      openSnackBar(t("snackbar.multipleMp4NotAllowed"));
      return;
    }
    if (videos.length === 1) {
      const vf = videos[0]!;
      const g = gateVideoAsMediaFile(vf);
      if (snackbarFileGate(g, "video")) return;
      if (imageGallery.length >= 2) {
        pendingVideoBackgroundFileRef.current = vf;
        setDialogClearGalleryForVideo(true);
        return;
      }
      applyBackgroundMp4File(vf);
      return;
    }

    loadGalleryImagesFromFiles(images, true);
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

  const subtitleLoad = async (event: { target: HTMLInputElement }) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (!isSrtFileByName(file.name)) {
        openSnackBar(t("snackbar.subtitleTypeNotSupported"));
        return;
      }
      await loadSubtitleFile(file);
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

    const imageFiles = files.filter((f) => isImageFileByName(f.name) && !isVideoFileByName(f.name));
    const videoFiles = files.filter((f) => isVideoFileByName(f.name));
    const mixedStillsAndVideo = imageFiles.length > 0 && videoFiles.length > 0;
    if (mixedStillsAndVideo) {
      openSnackBar(t("snackbar.mixedMp4AndImages"));
    } else if (videoFiles.length > 1) {
      openSnackBar(t("snackbar.multipleMp4NotAllowed"));
    }

    let audioFile: File | null = null;
    let subtitleFile: File | null = null;

    for (const file of files) {
      if (isSrtFileByName(file.name) && !subtitleFile) {
        subtitleFile = file;
      } else if (isAudioFileByName(file.name) && !isVideoFileByName(file.name) && !audioFile) {
        audioFile = file;
      }
    }

    if (!mixedStillsAndVideo && imageFiles.length > 0) {
      loadGalleryImagesFromFiles(imageFiles, true);
    }

    if (!mixedStillsAndVideo && videoFiles.length === 1) {
      pendingDroppedVideoChoiceRef.current = {
        videoFile: videoFiles[0]!,
        audioFile,
        subtitleFile,
      };
      setDialogDroppedVideoChoice(true);
      return;
    }

    if (audioFile) {
      await loadAudioFile(audioFile);
    }
    if (subtitleFile) {
      await loadSubtitleFile(subtitleFile);
    }
  };

  const handleDroppedVideoChoice = async (
    choice: "background" | "audio" | "cancel"
  ) => {
    const pending = pendingDroppedVideoChoiceRef.current;
    pendingDroppedVideoChoiceRef.current = null;
    setDialogDroppedVideoChoice(false);
    if (!pending) return;

    if (choice === "background") {
      if (pending.audioFile) {
        await loadAudioFile(pending.audioFile);
      }
      applyBackgroundMp4File(pending.videoFile);
    } else if (choice === "audio") {
      loadVideoAsAudioSource(pending.videoFile);
    } else if (pending.audioFile) {
      await loadAudioFile(pending.audioFile);
    }

    if (pending.subtitleFile) {
      await loadSubtitleFile(pending.subtitleFile);
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
    let start = parseFloat(shortStartSecStr.replace(",", "."));
    if (!Number.isFinite(start)) {
      start = 0;
    }
    const durationParsed = parseFloat(shortDurationSecStr.replace(",", "."));
    let duration: number;
    if (!shortDurationSecStr.trim() || !Number.isFinite(durationParsed)) {
      duration = Math.max(0, mediaDur - start);
    } else {
      duration = durationParsed;
    }
    start = Math.max(0, Math.min(start, mediaDur));
    duration = Math.max(0, Math.min(duration, mediaDur - start));
    return { full: false, start, duration };
  }, [shortOutputPreset, shortStartSecStr, shortDurationSecStr, getMediaDurationSec]);

  const applyPlaybackClipFade = useCallback(
    (clip: ResolvedClip) => {
      const gain = clipGainRef.current;
      const ctx = audioCtxRef.current;
      if (!gain || !ctx) return;
      if (shortOutputPreset === "all" || clip.full) {
        resetClipGain(gain, ctx);
        return;
      }
      const mediaDur = getMediaDurationSec();
      const explicitDur = parseExplicitDurationSec(shortDurationSecStr);
      const schedule = resolveClipFadeSchedule(
        clip,
        mediaDur,
        parseFadeSecStr(shortFadeInSecStr),
        parseFadeSecStr(shortFadeOutSecStr),
        explicitDur
      );
      scheduleClipGainFade(gain, ctx, schedule, ctx.currentTime);
    },
    [getMediaDurationSec, shortDurationSecStr, shortFadeInSecStr, shortFadeOutSecStr, shortOutputPreset]
  );

  const clearPlaybackWindowTimer = useCallback(() => {
    if (playbackWindowTimerRef.current != null) {
      window.clearTimeout(playbackWindowTimerRef.current);
      playbackWindowTimerRef.current = null;
    }
  }, []);

  const getAuthoringTimeSec = useCallback((): number => {
    if (isPlaySoundRef.current || isRecording) {
      return getCurrentPlaybackTimeSec();
    }
    const v = videoElementRef.current;
    if (v && Number.isFinite(v.currentTime)) {
      return Math.max(0, v.currentTime);
    }
    return NaN;
  }, [isRecording, getCurrentPlaybackTimeSec]);

  const ensureSrtAuthorCueRowsInView = useCallback(() => {
    if (!srtAuthorPanelEnabled) return;
    const container = srtAuthorCueListRef.current;
    const active = srtAuthorActiveCueRowRef.current;
    if (!container || !active) return;
    const next = srtAuthorNextCueRowRef.current;
    const pad = 8;
    const adjust = (): boolean => {
      const cRect = container.getBoundingClientRect();
      const rects: DOMRect[] = [active.getBoundingClientRect()];
      if (next) rects.push(next.getBoundingClientRect());
      const minTop = Math.min(...rects.map((r) => r.top));
      const maxBottom = Math.max(...rects.map((r) => r.bottom));
      const deltaUp = cRect.top + pad - minTop;
      if (deltaUp > 0) {
        container.scrollTop -= deltaUp;
        return true;
      }
      const deltaDown = maxBottom - (cRect.bottom - pad);
      if (deltaDown > 0) {
        container.scrollTop += deltaDown;
        return true;
      }
      return false;
    };
    if (adjust()) adjust();
  }, [srtAuthorPanelEnabled]);

  useLayoutEffect(() => {
    if (!srtAuthorPanelEnabled || srtAuthorCues.length === 0) return;
    ensureSrtAuthorCueRowsInView();
  }, [
    srtAuthorLineIndex,
    srtAuthorPhase,
    srtAuthorCues.length,
    srtAuthorRecordActive,
    srtAuthorPanelEnabled,
    ensureSrtAuthorCueRowsInView,
  ]);

  const pushSrtAuthorUndoSnapshot = useCallback(() => {
    srtAuthorUndoRef.current.push({
      cues: JSON.parse(JSON.stringify(srtAuthorCuesRef.current)) as SubtitleCue[],
      lineIdx: srtAuthorLineIndexRef.current,
      phase: srtAuthorPhaseRef.current,
    });
    if (srtAuthorUndoRef.current.length > 48) {
      srtAuthorUndoRef.current.shift();
    }
  }, []);

  const popSrtAuthorUndoSnapshot = useCallback(() => {
    const p = srtAuthorUndoRef.current.pop();
    if (!p) return false;
    setSrtAuthorCues(p.cues);
    setSrtAuthorLineIndex(p.lineIdx);
    setSrtAuthorPhase(p.phase);
    return true;
  }, []);

  const updateSrtAuthorCueTime = useCallback((index: number, field: SrtAuthorCueTimeKey, value: number) => {
    setSrtAuthorCues((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const nudgeSrtAuthorCueTime = useCallback((index: number, field: SrtAuthorCueTimeKey, delta: number) => {
    setSrtAuthorCues((prev) => {
      const next = [...prev];
      const cur = next[index];
      if (!cur) return prev;
      const current = cur[field];
      const base = Number.isFinite(current) ? current : 0;
      next[index] = { ...cur, [field]: Number((base + delta).toFixed(2)) };
      return next;
    });
  }, []);

  const stopSrtAuthorTimeRepeat = useCallback(() => {
    const repeat = srtAuthorTimeRepeatRef.current;
    if (!repeat) return;
    if (repeat.timeoutId !== null) clearTimeout(repeat.timeoutId);
    if (repeat.intervalId !== null) clearInterval(repeat.intervalId);
    srtAuthorTimeRepeatRef.current = null;
  }, []);

  const startSrtAuthorTimeRepeat = useCallback(
    (index: number, field: SrtAuthorCueTimeKey, delta: number) => {
      stopSrtAuthorTimeRepeat();
      nudgeSrtAuthorCueTime(index, field, delta);
      const timeoutId = setTimeout(() => {
        const intervalId = setInterval(() => {
          nudgeSrtAuthorCueTime(index, field, delta);
        }, SRT_AUTHOR_TIME_REPEAT_INTERVAL_MS);
        srtAuthorTimeRepeatRef.current = { timeoutId: null, intervalId };
      }, SRT_AUTHOR_TIME_REPEAT_DELAY_MS);
      srtAuthorTimeRepeatRef.current = { timeoutId, intervalId: null };
    },
    [nudgeSrtAuthorCueTime, stopSrtAuthorTimeRepeat]
  );

  useEffect(() => stopSrtAuthorTimeRepeat, [stopSrtAuthorTimeRepeat]);

  const srtAuthorReflectLyrics = useCallback(() => {
    const mediaDur = getMediaDurationSec();
    if (!(mediaDur > 0)) {
      openSnackBar(t("snackbar.subtitleAuthorNeedAudio"));
      return;
    }
    const lines = parseLyricsLinesFromSuno(srtAuthorLyricsRaw);
    if (lines.length === 0) {
      openSnackBar(t("snackbar.subtitleAuthorNoLyrics"));
      return;
    }
    pushSrtAuthorUndoSnapshot();
    const win = getPlaybackWindowBounds(resolvePlaybackWindow(), mediaDur);
    const cues = evenSplitCuesInWindow(lines, win);
    setSrtAuthorCues(cues);
    setSrtAuthorLineIndex(0);
    setSrtAuthorPhase("wait_start");
    openSnackBar(t("snackbar.subtitleAuthorReflectDone", { count: cues.length }));
    queueMicrotask(() => ensureSrtAuthorCueRowsInView());
  }, [
    ensureSrtAuthorCueRowsInView,
    getMediaDurationSec,
    openSnackBar,
    pushSrtAuthorUndoSnapshot,
    resolvePlaybackWindow,
    srtAuthorLyricsRaw,
    t,
  ]);

  const srtAuthorEvenSplitAgain = useCallback(() => {
    const mediaDur = getMediaDurationSec();
    if (!(mediaDur > 0)) {
      openSnackBar(t("snackbar.subtitleAuthorNeedAudio"));
      return;
    }
    if (srtAuthorCuesRef.current.length === 0) {
      openSnackBar(t("snackbar.subtitleAuthorNoCues"));
      return;
    }
    pushSrtAuthorUndoSnapshot();
    const win = getPlaybackWindowBounds(resolvePlaybackWindow(), mediaDur);
    const texts = srtAuthorCuesRef.current.map((c) => c.text);
    setSrtAuthorCues(evenSplitCuesInWindow(texts, win));
    setSrtAuthorLineIndex(0);
    setSrtAuthorPhase("wait_start");
    openSnackBar(t("snackbar.subtitleAuthorEvenSplitDone"));
    queueMicrotask(() => ensureSrtAuthorCueRowsInView());
  }, [ensureSrtAuthorCueRowsInView, getMediaDurationSec, openSnackBar, pushSrtAuthorUndoSnapshot, resolvePlaybackWindow, t]);

  const srtAuthorMarkStart = useCallback(() => {
    if (!(isPlaySoundRef.current || isRecording)) {
      openSnackBar(t("snackbar.subtitleAuthorMarkWhilePlaying"));
      return;
    }
    if (srtAuthorPhaseRef.current !== "wait_start") {
      return;
    }
    const idx = srtAuthorLineIndexRef.current;
    const cues = srtAuthorCuesRef.current;
    if (idx >= cues.length) {
      return;
    }
    const tsec = getAuthoringTimeSec();
    if (!Number.isFinite(tsec)) {
      openSnackBar(t("snackbar.subtitleAuthorMarkWhilePlaying"));
      return;
    }
    pushSrtAuthorUndoSnapshot();
    setSrtAuthorCues((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (!cur) return prev;
      const endMin = tsec + 0.05;
      next[idx] = {
        ...cur,
        startSec: tsec,
        endSec: cur.endSec > endMin ? cur.endSec : endMin,
      };
      return next;
    });
    setSrtAuthorPhase("inside_line");
  }, [getAuthoringTimeSec, isRecording, openSnackBar, pushSrtAuthorUndoSnapshot, t]);

  const srtAuthorMarkEnd = useCallback(() => {
    if (!(isPlaySoundRef.current || isRecording)) {
      openSnackBar(t("snackbar.subtitleAuthorMarkWhilePlaying"));
      return;
    }
    if (srtAuthorPhaseRef.current !== "inside_line") {
      return;
    }
    const idx = srtAuthorLineIndexRef.current;
    const cues = srtAuthorCuesRef.current;
    if (idx >= cues.length) {
      return;
    }
    const tsec = getAuthoringTimeSec();
    if (!Number.isFinite(tsec)) {
      openSnackBar(t("snackbar.subtitleAuthorMarkWhilePlaying"));
      return;
    }
    pushSrtAuthorUndoSnapshot();
    const nextCues = [...cues];
    const cur = nextCues[idx];
    if (!cur) return;
    const endSec = Math.max(tsec, cur.startSec + 0.05);
    nextCues[idx] = { ...cur, endSec };
    setSrtAuthorCues(nextCues);
    srtAuthorCuesRef.current = nextCues;
    const nextIdx = idx + 1;
    if (nextIdx >= cues.length) {
      setSrtAuthorLineIndex(nextIdx);
      setSrtAuthorPhase("wait_start");
      setSrtAuthorRecordActive(false);
      setDialogSrtAuthorApplyConfirm(true);
    } else {
      setSrtAuthorLineIndex(nextIdx);
      setSrtAuthorPhase("wait_start");
    }
  }, [getAuthoringTimeSec, isRecording, openSnackBar, pushSrtAuthorUndoSnapshot, t]);

  const srtAuthorEnsurePlaybackForMark = useCallback((): boolean => {
    if (isPlaySoundRef.current || isRecording) {
      return true;
    }
    const clip = resolvePlaybackWindow();
    if (clip.full === false && clip.duration <= 0) {
      openSnackBar(t("snackbar.shortClipInvalid"));
      return false;
    }
    onPlaySoundPlaybackRef.current();
    return true;
  }, [isRecording, openSnackBar, resolvePlaybackWindow, t]);

  const srtAuthorUndoLast = useCallback(() => {
    if (popSrtAuthorUndoSnapshot()) {
      openSnackBar(t("snackbar.subtitleAuthorUndo"));
    }
  }, [openSnackBar, popSrtAuthorUndoSnapshot, t]);

  const srtAuthorExportSrt = useCallback(() => {
    const shifted = shiftCuesBySeconds(srtAuthorCuesRef.current, srtAuthorGlobalOffsetMs / 1000);
    const body = formatSrtFromCues(shifted);
    if (!body.trim()) {
      openSnackBar(t("snackbar.subtitleAuthorExportEmpty"));
      return;
    }
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const fallbackBase = "subtitle_" + Math.random().toString(36).slice(-8);
    a.download = buildDownloadSrtName(audioFileName, fallbackBase);
    a.click();
    URL.revokeObjectURL(a.href);
    openSnackBar(t("snackbar.subtitleAuthorExported"));
  }, [audioFileName, openSnackBar, srtAuthorGlobalOffsetMs, t]);

  const srtAuthorApplyToPreview = useCallback(() => {
    const shifted = shiftCuesBySeconds(srtAuthorCuesRef.current, srtAuthorGlobalOffsetMs / 1000);
    const body = formatSrtFromCues(shifted);
    if (!body.trim()) {
      openSnackBar(t("snackbar.subtitleAuthorExportEmpty"));
      return;
    }
    const cues = parseSrt(body);
    if (cues.length === 0) {
      openSnackBar(t("snackbar.subtitleParseFailed"));
      return;
    }
    setSubtitleCues(cues);
    setSubtitleFileName("authored.srt");
    setSubtitleEnabled(true);
    openSnackBar(t("snackbar.subtitleAuthorApplied", { count: cues.length }));
    if (rendererType === "webgl") {
      setRendererType("canvas2d");
      mwvSetItem("common_rendererType", "canvas2d");
      openSnackBar(t("snackbar.subtitleCanvasFallback"));
    }
  }, [openSnackBar, rendererType, srtAuthorGlobalOffsetMs, t]);

  const lyricsTxtLoad = useCallback(
    async (event: { target: HTMLInputElement }) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        if (!isLyricsTextFileByName(file.name)) {
          openSnackBar(t("snackbar.subtitleAuthorTxtOnly"));
          return;
        }
        const text = await file.text();
        setSrtAuthorLyricsRaw(text);
        openSnackBar(t("snackbar.subtitleAuthorTxtLoaded"));
      } catch {
        openSnackBar(t("snackbar.subtitleAuthorTxtFailed"));
      } finally {
        event.target.value = "";
      }
    },
    [openSnackBar, t]
  );

  useEffect(() => {
    if (!srtAuthorPanelEnabled || !srtAuthorRecordActive) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") {
        return;
      }
      const el = e.target as HTMLElement | null;
      if (isTypingTargetForSrtAuthorSpaceKey(el)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (srtAuthorPhaseRef.current === "wait_start") {
        if (!srtAuthorEnsurePlaybackForMark()) {
          return;
        }
        queueMicrotask(() => {
          srtAuthorMarkStart();
        });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") {
        return;
      }
      const el = e.target as HTMLElement | null;
      if (isTypingTargetForSrtAuthorSpaceKey(el)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (srtAuthorPhaseRef.current === "inside_line") {
        srtAuthorMarkEnd();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [
    srtAuthorPanelEnabled,
    srtAuthorRecordActive,
    srtAuthorEnsurePlaybackForMark,
    srtAuthorMarkStart,
    srtAuthorMarkEnd,
  ]);

  const setupAudioSourceForPlayback = (clip: ResolvedClip) => {
    if (videoElementRef.current) {
      const video = videoElementRef.current;
      if (!video.paused) {
        video.pause();
      }
      if (clip.full === false) {
        const target = clip.start;
        // 毎回 currentTime を書き換えると先頭付近で微小な停止が出る端末がある
        if (!Number.isFinite(video.currentTime) || Math.abs(video.currentTime - target) > 0.05) {
          video.currentTime = target;
        }
        audioPlaybackOffsetSecRef.current = target;
      } else {
        if (!Number.isFinite(video.currentTime) || Math.abs(video.currentTime) > 0.05) {
          video.currentTime = 0;
        }
        audioPlaybackOffsetSecRef.current = 0;
      }
      audioPlaybackStartCtxTimeRef.current = null;
      return;
    }
    if (!decodedAudioBufferRef.current) {
      return;
    }
    const audioBufferSourceNode = audioCtxRef.current.createBufferSource();
    audioBufferSourceNode.buffer = decodedAudioBufferRef.current;
    audioBufferSourceNode.loop = false;
    audioBufferSourceNode.onended = () => {
      audioPlaybackStartCtxTimeRef.current = null;
      isPlaySoundRef.current = false;
      setIsPlaySound(false);
      stopCanvas2DAnimation();
      stopWebGLAnimation();
    };
    const clipGain = clipGainRef.current;
    if (clipGain) {
      audioBufferSourceNode.connect(clipGain);
    } else {
      audioBufferSourceNode.connect(analyserRef.current);
    }
    audioBufferSrcRef.current = audioBufferSourceNode;
    audioPlaybackOffsetSecRef.current = clip.full === false ? clip.start : 0;
  };

  const finishVideoWindowPlayback = useCallback(() => {
    clearPlaybackWindowTimer();
    if (videoElementRef.current) {
      videoElementRef.current.pause();
    }
    if (clipGainRef.current && audioCtxRef.current) {
      resetClipGain(clipGainRef.current, audioCtxRef.current);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    audioPlaybackStartCtxTimeRef.current = null;
    isPlaySoundRef.current = false;
    setIsPlaySound(false);
    stopCanvas2DAnimation();
    stopWebGLAnimation();
  }, [clearPlaybackWindowTimer]);

  // PlaySoundEvent
  const onPlaySound = () => {
    if (isPlaySound) {
      mwvMilestone("preview: 停止（再生オフ）", {
        hadRecorder: Boolean(mediaRecorderRef.current),
        recorderState: mediaRecorderRef.current?.state,
      });
      clearPlaybackWindowTimer();
      // MediaRecorder を先に止めて partial WebM の stop イベントを発火させる
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
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
      if (clipGainRef.current && audioCtxRef.current) {
        resetClipGain(clipGainRef.current, audioCtxRef.current);
      }
      audioPlaybackStartCtxTimeRef.current = null;
      stopCanvas2DAnimation();
      stopWebGLAnimation();
      isPlaySoundRef.current = false;
      setIsPlaySound(false);
      return;
    }
    const clip = resolvePlaybackWindow();
    if (clip.full === false && clip.duration <= 0) {
      openSnackBar(t("snackbar.shortClipInvalid"));
      return;
    }
    mwvLog("preview: 再生開始", {
      clipFull: clip.full,
      duration: clip.full === false ? clip.duration : "full",
      hasVideo: Boolean(videoElementRef.current),
    });
    setupAudioSourceForPlayback(clip);

    if (videoElementRef.current) {
      audioPlaybackStartCtxTimeRef.current = null;
      videoElementRef.current.play().then(() => {
        applyPlaybackClipFade(clip);
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
      audioPlaybackStartCtxTimeRef.current = audioCtxRef.current.currentTime;
      if (clip.full === false) {
        audioBufferSrcRef.current.start(0, clip.start, clip.duration);
      } else {
        audioBufferSrcRef.current.start(0);
      }
      applyPlaybackClipFade(clip);
    }

    isPlaySoundRef.current = true;
    setIsPlaySound(true);
  };
  onPlaySoundPlaybackRef.current = onPlaySound;

  const srtAuthorOnBtnStartClick = useCallback(() => {
    if (!srtAuthorRecordActive) return;
    if (srtAuthorPhase !== "wait_start" || srtAuthorLineIndex >= srtAuthorCues.length) return;
    if (!srtAuthorEnsurePlaybackForMark()) return;
    queueMicrotask(() => {
      srtAuthorMarkStart();
    });
  }, [
    srtAuthorRecordActive,
    srtAuthorPhase,
    srtAuthorLineIndex,
    srtAuthorCues.length,
    srtAuthorEnsurePlaybackForMark,
    srtAuthorMarkStart,
  ]);
  // RecordMovieEvent
  const onRecordMovie = () => {
    if (!canvasRef.current) {
      openSnackBar(t("snackbar.canvasNotReady"));
      return;
    }
    mwvMilestone("record: 動画生成クリック", {
      hasVideo: Boolean(videoElementRef.current),
      rendererType,
      mode,
      spectrumOpacityPercent,
    });
    // 録画セットアップ（MediaRecorder初期化）
    setTimeout(() => {
      const audioStream = streamDestinationRef.current.stream;
      const canvasStream = canvasRef.current.captureStream(RECORDING_MAX_FPS);
      const outputStream = new MediaStream();
      [audioStream, canvasStream].forEach((stream) => {
        stream.getTracks().forEach(function (track: MediaStreamTrack) {
          outputStream.addTrack(track);
        });
      });
      const videoBps = Math.round(recordVideoBitrateMbps * 1_000_000);
      const recorderOptions: MediaRecorderOptions = {
        mimeType: "video/webm;codecs=h264",
      };
      if (videoBps >= 1_000_000 && videoBps <= 80_000_000) {
        recorderOptions.videoBitsPerSecond = videoBps;
      }
      const audioBps = clampRecordAudioBitsPerSecond(exportAudioBitrateKbps, recordAudioBitrateKbps);
      recorderOptions.audioBitsPerSecond = audioBps;
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(outputStream, recorderOptions);
      } catch {
        recorder = new MediaRecorder(outputStream, { mimeType: "video/webm" });
      }
      const recordedBlobs: Blob[] = [];
      recorder.addEventListener("dataavailable", (e) => {
        recordedBlobs.push(e.data);
      });
      const safeStopRecorder = () => {
        if (recorder.state !== "recording") {
          mwvLog("record: safeStopRecorder skipped (not recording)", { state: recorder.state });
          return;
        }
        mwvLog("record: safeStopRecorder (requestData + delayed stop)");
        try {
          recorder.requestData();
        } catch {
          /* ignore */
        }
        // 末尾チャンクの flush を待って stop（即 stop だと終端が欠ける環境がある）
        window.setTimeout(() => {
          if (recorder.state === "recording") {
            try {
              recorder.stop();
            } catch {
              /* ignore */
            }
          }
        }, 140);
      };
      //録画終了時に動画ファイルのダウンロードリンクを生成する処理
      recorder.addEventListener("stop", async () => {
        const recordedMimeType =
          recorder.mimeType && recorder.mimeType.length > 0 ? recorder.mimeType : "video/webm";
        mediaRecorderRef.current = null;
        setRecordingActive(false);
        const movieName = "movie_" + Math.random().toString(36).slice(-8);
        const downloadMp4Name = buildDownloadMp4Name(audioFileName, movieName);
        const webmName = movieName + ".webm";
        const mp4Name = movieName + ".mp4";
        const webmBlob = new Blob(recordedBlobs, { type: recordedMimeType });
        mwvMilestone("record: MediaRecorder stop", {
          chunkCount: recordedBlobs.length,
          webmBytes: webmBlob.size,
          mimeType: recordedMimeType,
        });

        try {
          setEncodeStatus("loading");
          setEncodeProgress(0);
          const binaryData = new Uint8Array(await webmBlob.arrayBuffer());
          mwvMilestone("record: ffmpeg へ渡す直前", { bufferBytes: binaryData.byteLength });
          const video = await generateMp4Video(
            binaryData,
            webmName,
            mp4Name,
            {
              onLoadStart: () => setEncodeStatus("loading"),
              onLoadComplete: () => {
                setEncodeStatus("converting");
                setEncodeProgress(0);
              },
              onProgress: (ratio) => {
                if (!Number.isFinite(ratio)) return;
                const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
                setEncodeProgress(pct);
              },
            },
            targetLufs,
            exportAudioBitrateKbps
          );
          if (!video || video.length === 0) {
            throw new Error("empty_mp4");
          }

          setEncodeStatus("idle");
          const mp4Blob = new Blob([video], { type: "video/mp4" });
          const objectURL = URL.createObjectURL(mp4Blob);

          const a = document.createElement("a");
          a.href = objectURL;
          a.download = downloadMp4Name;
          a.click();
          a.remove();
          exitConfirmRef.current = false;
          openSnackBar(t("snackbar.convertComplete"));
        } catch (error) {
          const msg = (error as Error).message || "unknown_error";
          mwvError("record: MP4 変換エラー", error);
          openSnackBar(t("snackbar.convertFailed", { error: msg }));
          setEncodeStatus("idle");
        } finally {
          setRecordMovieDisabled(false);
        }
      });
      const clip = resolvePlaybackWindow();
      if (clip.full === false && clip.duration <= 0) {
        setRecordingActive(false);
        setRecordMovieDisabled(false);
        openSnackBar(t("snackbar.shortClipInvalid"));
        return;
      }

      // 再生終了時の処理（音声はスライス再生時も onended で区間終了）
      if (videoElementRef.current) {
        if (clip.full !== false) {
          const originalOnEnded = videoElementRef.current.onended;
          videoElementRef.current.onended = () => {
            mwvMilestone("record: 背景動画再生終了（録画停止へ）");
            if (originalOnEnded) {
              originalOnEnded.call(videoElementRef.current);
            }
            safeStopRecorder();
            setRecordingActive(false);
            isPlaySoundRef.current = false;
            setIsPlaySound(false);
          };
        }
        // ショート区間の動画は onPlaySound 内のタイマーで停止・recorder.stop
      }
      // 静止画＋音声のみ: setupAudioSourceForPlayback は onPlaySound 内で実行されるため、
      // ここ（再生前）に onended を付けても旧ノード／null に当たり、録画が終わらない不具合になる。
      // 録画終了ハンドラは onPlaySound 直後に audioBufferSrcRef へ差し込む（下の else 分岐）。

      const startRecorder = () => {
        if (recorder.state !== "inactive") return;
        setRecordingActive(true);
        mediaRecorderRef.current = recorder;
        recorder.start();
        mwvMilestone("record: MediaRecorder.start", {
          mimeType: recorder.mimeType,
          state: recorder.state,
        });
        openSnackBar(t("snackbar.recording"));
        setRecordMovieDisabled(true);
      };

      // MP4入力時のみ、recorder.start の負荷が再生中に入ると瞬断しやすい。
      // 先に recorder を起動してから再生を始め、瞬断を再生中に発生させない。
      if (videoElementRef.current) {
        startRecorder();
        window.setTimeout(() => {
          onPlaySound();
        }, 120);
      } else {
        onPlaySound();
        if (audioBufferSrcRef.current) {
          const node = audioBufferSrcRef.current;
          const priorOnEnded = node.onended;
          node.onended = (ev: Event) => {
            mwvMilestone("record: 音声再生終了（録画停止へ）");
            try {
              if (typeof priorOnEnded === "function") {
                priorOnEnded.call(node, ev);
              }
            } catch {
              /* ignore */
            }
            safeStopRecorder();
            setRecordingActive(false);
            isPlaySoundRef.current = false;
            setIsPlaySound(false);
          };
        } else {
          mwvError("record: 音声のみ録画だが audioBufferSrcRef が無い（onPlaySound 後）");
        }
        window.setTimeout(startRecorder, 80);
      }
    }, 100); // 100ms待機して録画用canvasのアニメーション開始を保証
  };

  const onQuickEncodeMovie = async () => {
    if (!decodedAudioBufferRef.current && !videoElementRef.current) {
      openSnackBar("音声ファイルが読み込まれていません");
      return;
    }
    if (videoElementRef.current) {
      openSnackBar("動画ファイルの高速生成は現在サポートされていません");
      return;
    }
    const audioBuffer = decodedAudioBufferRef.current;
    if (!audioBuffer) {
      openSnackBar("音声データが読み込まれていません");
      return;
    }

    quickEncodeCancelRef.current = false;
    setIsQuickEncoding(true);
    setQuickEncodingProgress({
      stage: "analyzing",
      progress: 0,
      message: "音声データを解析中...",
    });

    try {
      const analysisResult = await analyzeAudioRealtime(
        audioBuffer,
        60,
        2048,
        (progress) => {
          if (!quickEncodeCancelRef.current) {
            setQuickEncodingProgress(progress);
          }
        },
        () => quickEncodeCancelRef.current || quickEncoderRef.current?.isCancelled() || false
      );

      if (quickEncodeCancelRef.current) {
        throw new Error("Cancelled");
      }

      const { width, height } = getCanvasDimensions(activeCanvasLayout);
      const encoderConfig: QuickEncoderConfig = {
        width,
        height,
        frameRate: 60,
        bitrate: Math.round(recordVideoBitrateMbps * 1_000_000),
        mode,
        adjustments: modeAdjustments,
        backgroundImage: imageCtx,
        rendererType,
      };

      const encoder = new QuickVideoEncoder(encoderConfig, (progress) => {
        if (!quickEncodeCancelRef.current) {
          setQuickEncodingProgress(progress);
        }
      });
      quickEncoderRef.current = encoder;

      const webmBlob = await encoder.encodeWithCanvas2D(analysisResult, imageCtx);
      if (quickEncodeCancelRef.current || encoder.isCancelled()) {
        throw new Error("Cancelled");
      }

      const movieBase = "movie_quick_" + Math.random().toString(36).slice(-8);
      const downloadMp4Name = buildDownloadMp4Name(audioFileName, movieBase);
      const webmName = movieBase + ".webm";
      const mp4Name = movieBase + ".mp4";
      const binaryData = new Uint8Array(await webmBlob.arrayBuffer());

      const video = await generateMp4Video(
        binaryData,
        webmName,
        mp4Name,
        {
          onLoadStart: () =>
            setQuickEncodingProgress({
              stage: "finalizing",
              progress: 72,
              message: t("encode.loadingFfmpeg"),
            }),
          onLoadComplete: () =>
            setQuickEncodingProgress({
              stage: "finalizing",
              progress: 78,
              message: t("encode.converting", { progress: 78 }),
            }),
          onProgress: (ratio) => {
            if (!Number.isFinite(ratio)) return;
            const pct = 78 + Math.round(Math.max(0, Math.min(1, ratio)) * 22);
            setQuickEncodingProgress({
              stage: "finalizing",
              progress: pct,
              message: t("encode.converting", { progress: pct }),
            });
          },
        },
        targetLufs,
        exportAudioBitrateKbps
      );

      if (!video || video.length === 0) {
        throw new Error("empty_mp4");
      }

      const mp4Blob = new Blob([video], { type: "video/mp4" });
      const objectURL = URL.createObjectURL(mp4Blob);
      const a = document.createElement("a");
      a.href = objectURL;
      a.download = downloadMp4Name;
      a.click();
      a.remove();
      openSnackBar("動画の高速生成が完了しました");
    } catch (error) {
      if (error instanceof Error && error.message === "Cancelled") {
        openSnackBar("高速生成をキャンセルしました");
      } else {
        mwvError("quick-encode error", error);
        openSnackBar("動画の高速生成に失敗しました");
      }
    } finally {
      quickEncodeCancelRef.current = false;
      quickEncoderRef.current = null;
      setIsQuickEncoding(false);
      setQuickEncodingProgress(null);
    }
  };

  const onCancelQuickEncode = () => {
    quickEncodeCancelRef.current = true;
    quickEncoderRef.current?.cancel();
    openSnackBar("高速生成をキャンセルしています...");
  };

  // クリア（ページロード時の状態に戻す）
  const onClear = () => {
    clearPlaybackWindowTimer();
    mediaRecorderRef.current = null;
    quickEncodeCancelRef.current = true;
    quickEncoderRef.current?.cancel();
    quickEncoderRef.current = null;
    setIsQuickEncoding(false);
    setQuickEncodingProgress(null);
    disposeStandaloneBackgroundVideo();
    setBackgroundMediaMode("none");
    setBackgroundVideoFileName("");
    setReuseAudioVideoForBackground(false);
    setBackgroundVideoLayoutCache(null);
    setVideoBackgroundRepaintNonce((n) => n + 1);
    // 再生停止
    if (audioBufferSrcRef.current) {
      try {
        audioBufferSrcRef.current.stop(0);
      } catch {}
      audioBufferSrcRef.current = null;
    }
    if (videoElementRef.current) {
      videoElementRef.current.onerror = null;
      videoElementRef.current.onloadedmetadata = null;
      videoElementRef.current.onended = null;
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
      const ctx = canvasRef.current.getContext("2d", { alpha: true });
      if (ctx) {
        ctx.fillStyle = "rgba(34, 34, 34, 1.0)";
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    clearImageCache();
    clearWebGLImageCache();
    setImageGallery((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.objectUrl));
      return [];
    });
    setGalleryIndex(0);
    setAudioFileName("");
    setSubtitleFileName("");
    setSubtitleCues([]);
    setSubtitleEnabled(true);
    setSubtitleStyle(DEFAULT_SUBTITLE_STYLE);
    setTitleText("");
    setTitleEnabled(true);
    setTitleStyle(DEFAULT_TITLE_STYLE);
    decodedAudioBufferRef.current = null;
    isPlaySoundRef.current = false;
    setIsPlaySound(false);
    setPlaySoundDisabled(true);
    setRecordMovieDisabled(true);
    setRecordingActive(false);
    setEncodeStatus("idle");
    setEncodeProgress(0);
    setMode(0);
    setCanvasSize("auto");
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
    setShortFadeInSecStr("0");
    setShortFadeOutSecStr("0");
    setRainWeather(DEFAULT_RAIN_WEATHER);
    setSnowWeather(DEFAULT_SNOW_WEATHER);
    setMirrorBall(DEFAULT_MIRROR_BALL);
    setTargetLufs(-14);
    setTargetLufsCustom("-14");
    setSpectrumColorHex("#FFFFFF");
    setSpectrumColorInput("#FFFFFF");
    setGalleryTransitionMode("crossfade");
    setSpaceParticleColor(DEFAULT_SPACE_PARTICLE);
    setSparkleParticleColor(DEFAULT_SPARKLE_PARTICLE);
    setDustParticleColor(DEFAULT_DUST_PARTICLE);
    setSpaceDirection("forward");
    setSpaceSpeed(1);
    setSparkleVariant("normal");
    setAtmosphereVariant("dust");
    setAtmosphereStrength(45);
    setSpaceColorInput(DEFAULT_SPACE_PARTICLE.toUpperCase());
    setSparkleColorInput(DEFAULT_SPARKLE_PARTICLE.toUpperCase());
    setDustColorInput(DEFAULT_DUST_PARTICLE.toUpperCase());
    setMirrorBallLightColorInput(DEFAULT_MIRROR_BALL.lightColor.toUpperCase());
    setMirrorBallSecondaryColorInput(DEFAULT_MIRROR_BALL.secondaryColor.toUpperCase());
    setSpectrumRainbowColorful(true);
    setRecordVideoBitrateMbps(8);
    setExportAudioBitrateKbps(320);
    setRecordAudioBitrateKbps(384);
    exitConfirmRef.current = false;
    openSnackBar(t("snackbar.cleared"));
  };

  const renderSrtAuthorTimeStepButton = (
    index: number,
    field: SrtAuthorCueTimeKey,
    delta: number,
    label: string
  ) => (
    <Box
      component="button"
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        startSrtAuthorTimeRepeat(index, field, delta);
      }}
      onPointerUp={stopSrtAuthorTimeRepeat}
      onPointerCancel={stopSrtAuthorTimeRepeat}
      onPointerLeave={stopSrtAuthorTimeRepeat}
      onBlur={stopSrtAuthorTimeRepeat}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        nudgeSrtAuthorCueTime(index, field, delta);
      }}
      sx={{
        width: 18,
        height: 18,
        minWidth: 18,
        p: 0,
        border: 1,
        borderColor: "divider",
        borderRadius: 0.5,
        bgcolor: "background.paper",
        color: "text.secondary",
        fontSize: "0.55rem",
        lineHeight: "16px",
        cursor: "pointer",
        "&:hover": { bgcolor: "action.hover" },
        "&:active": { bgcolor: "action.selected" },
      }}
    >
      {delta > 0 ? "▲" : "▼"}
    </Box>
  );

  const renderSrtAuthorTimeField = (
    cue: SubtitleCue,
    index: number,
    field: SrtAuthorCueTimeKey,
    label: string
  ) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 18px", gap: 0.25, width: { xs: "100%", sm: 94 } }}>
      <TextField
        size="small"
        type="text"
        inputProps={{ inputMode: "decimal" }}
        label={label}
        value={Number.isFinite(cue[field]) ? cue[field].toFixed(2) : ""}
        onChange={(e) => {
          const v = parseFloat(e.target.value.replace(",", "."));
          if (!Number.isFinite(v)) return;
          updateSrtAuthorCueTime(index, field, v);
        }}
        sx={{
          minWidth: 0,
          "& .MuiInputBase-input": {
            px: 0.75,
            fontSize: "0.72rem",
            lineHeight: 1.25,
          },
          "& .MuiInputLabel-root": {
            fontSize: "0.72rem",
          },
        }}
      />
      <Box sx={{ display: "flex", flexDirection: "column", gap: "1px", alignSelf: "center" }}>
        {renderSrtAuthorTimeStepButton(index, field, SRT_AUTHOR_TIME_STEP_SEC, `${label} +${SRT_AUTHOR_TIME_STEP_SEC}`)}
        {renderSrtAuthorTimeStepButton(index, field, -SRT_AUTHOR_TIME_STEP_SEC, `${label} -${SRT_AUTHOR_TIME_STEP_SEC}`)}
      </Box>
    </Box>
  );

  return (
    <ThemeProvider theme={muiTheme}>
      <>
      <div className="mx-auto box-border w-full max-w-[900px] px-3 pb-8 pt-4 text-slate-900 md:px-4 md:pt-8 dark:text-slate-100">
      <main className="space-y-5 md:space-y-6">
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
                    : t("encode.converting", { progress: Math.round(encodeProgress) })}
                </Typography>
                {encodeStatus === "converting" && (
                  <Typography variant="caption" sx={{ display: "block", mb: 0.75, opacity: 0.92 }}>
                    {t("encode.convertingHint")}
                  </Typography>
                )}
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
        <div
          className={`${styles.heading} relative rounded-2xl border border-slate-200/70 bg-white/80 shadow-md backdrop-blur-sm dark:border-slate-600/50 dark:bg-slate-900/85 dark:shadow-lg`}
        >
          <Tooltip
            title={uiScheme === "light" ? t("theme.toggleToDark") : t("theme.toggleToLight")}
            arrow
          >
            <IconButton
              type="button"
              size="small"
              onClick={toggleUiScheme}
              aria-label={uiScheme === "light" ? t("theme.toggleToDark") : t("theme.toggleToLight")}
              sx={{
                position: "absolute",
                top: 4,
                right: 6,
                zIndex: 2,
              }}
            >
              {uiScheme === "light" ? (
                <Lightbulb sx={{ color: "#f59e0b" }} fontSize="small" />
              ) : (
                <LightbulbOutlined sx={{ color: "#94a3b8" }} fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <h1 className={styles.heading__title}>{t("heading.title")}</h1>
          <div className={styles.heading__text}>
            <p>{t("heading.description")}</p>
            <p className={styles.heading__terms}>
              <a
                href="https://github.com/kuwa2005/music-waves-visualizer/blob/main/docs/USER_TERMS.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("heading.termsLink")}
              </a>
            </p>
          </div>
        </div>

        <div
          className={`${styles.dropZone} rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-sm backdrop-blur-sm md:p-5 dark:border-slate-600/50 dark:bg-slate-900/75 dark:shadow-md`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <Typography variant="body2" sx={{ mb: 0.25, fontWeight: 500 }}>
            {t("dropZone.hint")}
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, alignItems: "stretch" }}>
            <Box
              sx={{
                display: "flex",
                gap: 1.5,
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                flexWrap: "wrap",
              }}
            >
              <Button
                variant="outlined"
                component="label"
                startIcon={<PhotoLibrary />}
                size="medium"
                disabled={isQuickEncoding || isRecording || isPlaySound}
                sx={{ flexShrink: 0, minWidth: 200 }}
              >
                {t("dropZone.selectImage")}
                <input
                  type="file"
                  accept="image/*,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                  multiple
                  onChange={imageLoad}
                  hidden
                />
              </Button>
              <Typography
                variant="body2"
                color="textSecondary"
                sx={{
                  minWidth: 160,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  textAlign: "left",
                }}
              >
                {backgroundMediaMode === "video" && backgroundVideoFileName
                  ? backgroundVideoFileName
                  : imageGallery.length === 0
                  ? t("dropZone.unselected")
                  : imageGallery.length === 1
                    ? imageFileName
                    : t("gallery.currentName", { name: imageFileName, total: imageGallery.length })}
              </Typography>
            </Box>
            {imageGallery.length > 0 && (
              <>
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                  }}
                >
                  <IconButton
                    size="small"
                    disabled={imageGallery.length <= 1}
                    onClick={() =>
                      setGalleryIndex(
                        (i) => (i - 1 + imageGallery.length) % imageGallery.length
                      )
                    }
                    aria-label="gallery-prev"
                  >
                    <NavigateBefore />
                  </IconButton>
                  <Typography variant="caption" color="textSecondary">
                    {t("gallery.counter", {
                      current: activeGalleryIndex + 1,
                      total: imageGallery.length,
                    })}
                  </Typography>
                  <IconButton
                    size="small"
                    disabled={imageGallery.length <= 1}
                    onClick={() =>
                      setGalleryIndex((i) => (i + 1) % imageGallery.length)
                    }
                    aria-label="gallery-next"
                  >
                    <NavigateNext />
                  </IconButton>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={galleryAutoEnabled}
                        onChange={(_, c) => setGalleryAutoEnabled(c)}
                        disabled={imageGallery.length <= 1}
                      />
                    }
                    label={t("gallery.autoSwitch")}
                    sx={{ ml: 0.5 }}
                  />
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 140 }}>
                    <Typography variant="caption" color="textSecondary" sx={{ whiteSpace: "nowrap" }}>
                      {t("gallery.autoInterval", { sec: galleryAutoSec })}
                    </Typography>
                    <Slider
                      size="small"
                      value={galleryAutoSec}
                      min={2}
                      max={30}
                      step={1}
                      disabled={imageGallery.length <= 1 || !galleryAutoEnabled}
                      onChange={(_, v) => setGalleryAutoSec(v as number)}
                      sx={{ width: 100 }}
                    />
                  </Box>
                </Box>
                {imageGallery.length > 1 && (
                  <FormControl size="small" sx={{ width: "100%", maxWidth: 440, mt: 1.5, mx: "auto" }}>
                    <InputLabel id="gallery-transition-label">{t("gallery.imageTransition")}</InputLabel>
                    <Select
                      labelId="gallery-transition-label"
                      value={galleryTransitionMode}
                      label={t("gallery.imageTransition")}
                      onChange={(e) =>
                        setGalleryTransitionMode(e.target.value as GalleryTransitionUserMode)
                      }
                    >
                      {GALLERY_TRANSITION_SELECT_OPTIONS.map((m) => (
                        <MenuItem key={m} value={m}>
                          {t(galleryTransitionI18nKey(m))}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </>
            )}
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", justifyContent: "center", width: "100%" }}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<LibraryMusic />}
                size="medium"
                disabled={isQuickEncoding || isRecording || isPlaySound}
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

        <div className={`${styles.menu} rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-sm dark:border-slate-600/50 dark:bg-slate-900/80 dark:shadow-md`}>
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
              <Tab label={t("tabs.title")} />
              <Tab label={t("tabs.subtitle")} />
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
                <Typography variant="caption" color="textSecondary" sx={{ display: "block", mb: 0.5, textAlign: "center" }}>
                  {t("spectrum.groupFrequency")}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap", mb: 2 }}>
                  {[
                    { value: -1, label: t("spectrum.shortOff") },
                    { value: 0, label: t("spectrum.shortFreqBar") },
                    { value: 2, label: t("spectrum.shortCircle") },
                    { value: 3, label: t("spectrum.shortSymBar") },
                    { value: 4, label: t("spectrum.shortDot") },
                    { value: 7, label: t("spectrum.shortAreaFill") },
                    { value: 6, label: t("spectrum.shortGlyco") },
                  ].map((item) => (
                    <Tooltip key={item.value} title={t(getModeDescriptionKey(item.value))} arrow>
                      <Button
                        variant={mode === item.value ? "contained" : "outlined"}
                        onClick={() => onChangeMode({ target: { value: item.value.toString() } } as SelectChangeEvent<string>)}
                        size="small"
                      >
                        {item.label}
                      </Button>
                    </Tooltip>
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
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                      {t("spectrumWave.title")}
                    </Typography>
                    <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 0.5 }}>
                      {t("effect.weatherColor")}
                    </Typography>
                    <Box sx={paletteGridSx}>
                      {DEFAULT_COLOR_PALETTE_20.map((c) => (
                        <Box
                          key={`spec-${c}`}
                          component="button"
                          type="button"
                          aria-label={`${t("spectrumWave.title")} ${c}`}
                          onClick={() => {
                            const u = c.toUpperCase();
                            setSpectrumColorHex(u);
                            setSpectrumColorInput(u);
                          }}
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: 0.75,
                            border:
                              spectrumColorHex.toUpperCase() === c.toUpperCase()
                                ? "2px solid #111"
                                : "1px solid #999",
                            backgroundColor: c,
                            cursor: "pointer",
                            p: 0,
                          }}
                        />
                      ))}
                    </Box>
                    <TextField
                      size="small"
                      fullWidth
                      label={t("effect.weatherColorCode")}
                      value={spectrumColorInput}
                      onChange={(e) => {
                        const next = normalizeHexColorInput(e.target.value);
                        setSpectrumColorInput(next);
                        if (isHexColorCode(next)) {
                          setSpectrumColorHex(next);
                        }
                      }}
                      error={spectrumColorInput.length > 0 && !isHexColorCode(spectrumColorInput)}
                      helperText={
                        spectrumColorInput.length > 0 && !isHexColorCode(spectrumColorInput)
                          ? t("effect.weatherColorCodeInvalid")
                          : " "
                      }
                      inputProps={{ inputMode: "text", pattern: "#?[0-9a-fA-F]{6}" }}
                      sx={{ mb: 2 }}
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={spectrumRainbowColorful}
                          onChange={(_, c) => setSpectrumRainbowColorful(c)}
                          size="small"
                        />
                      }
                      label={t("spectrumWave.rainbowSymDot")}
                      sx={{ mb: 2, display: "flex", alignItems: "center" }}
                    />
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
                        <Typography gutterBottom>
                          {t("displayVolume.circleRotation", {
                            value:
                              circleRotationRpm == null
                                ? t("spectrum.off")
                                : `${circleRotationRpm} rpm`,
                          })}
                        </Typography>
                        <FormControl size="small" fullWidth sx={{ mb: 2 }}>
                          <Select
                            value={circleRotationRpm == null ? "off" : String(circleRotationRpm)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "off") {
                                setCircleRotationRpm(null);
                              } else {
                                const n = Number(v);
                                setCircleRotationRpm(isNaN(n) ? 0 : Math.max(-10, Math.min(10, Math.round(n))));
                              }
                            }}
                          >
                            <MenuItem value="off">{t("spectrum.off")}</MenuItem>
                            {Array.from({ length: 21 }, (_, idx) => idx - 10).map((rpm) => (
                              <MenuItem key={rpm} value={String(rpm)}>
                                {rpm}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
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
                    {isReactiveVisualMode(mode) && (
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                          {t("displayVolume.loudnessTuning")}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                          {(["natural", "strong", "edm"] as const).map((k) => (
                            <Button
                              key={k}
                              size="small"
                              variant="outlined"
                              onClick={() =>
                                setLoudnessParamsByMode((prev) => ({ ...prev, [mode]: { ...LOUDNESS_PRESETS[k] } }))
                              }
                            >
                              {t(`displayVolume.preset${k === "natural" ? "Natural" : k === "strong" ? "Strong" : "Edm"}`)}
                            </Button>
                          ))}
                        </Box>
                        <Typography gutterBottom>
                          {t("displayVolume.loudnessGain", {
                            value: (loudnessParamsByMode[mode]?.gain ?? DEFAULT_LOUDNESS_PARAMS.gain).toFixed(2),
                          })}
                        </Typography>
                        <Slider
                          value={loudnessParamsByMode[mode]?.gain ?? DEFAULT_LOUDNESS_PARAMS.gain}
                          min={0.1}
                          max={5}
                          step={0.05}
                          onChange={(_, v) =>
                            setLoudnessParamsByMode((prev) => ({
                              ...prev,
                              [mode]: { ...(prev[mode] ?? DEFAULT_LOUDNESS_PARAMS), gain: v as number },
                            }))
                          }
                        />
                        <Typography gutterBottom sx={{ mt: 2 }}>
                          {t("displayVolume.loudnessGamma", {
                            value: (loudnessParamsByMode[mode]?.gamma ?? DEFAULT_LOUDNESS_PARAMS.gamma).toFixed(2),
                          })}
                        </Typography>
                        <Slider
                          value={loudnessParamsByMode[mode]?.gamma ?? DEFAULT_LOUDNESS_PARAMS.gamma}
                          min={0.2}
                          max={3}
                          step={0.02}
                          onChange={(_, v) =>
                            setLoudnessParamsByMode((prev) => ({
                              ...prev,
                              [mode]: { ...(prev[mode] ?? DEFAULT_LOUDNESS_PARAMS), gamma: v as number },
                            }))
                          }
                        />
                        <Typography gutterBottom sx={{ mt: 2 }}>
                          {t("displayVolume.loudnessAttack", {
                            value: (loudnessParamsByMode[mode]?.attack ?? DEFAULT_LOUDNESS_PARAMS.attack).toFixed(2),
                          })}
                        </Typography>
                        <Slider
                          value={loudnessParamsByMode[mode]?.attack ?? DEFAULT_LOUDNESS_PARAMS.attack}
                          min={0.01}
                          max={0.9}
                          step={0.01}
                          onChange={(_, v) =>
                            setLoudnessParamsByMode((prev) => ({
                              ...prev,
                              [mode]: { ...(prev[mode] ?? DEFAULT_LOUDNESS_PARAMS), attack: v as number },
                            }))
                          }
                        />
                        <Typography gutterBottom sx={{ mt: 2 }}>
                          {t("displayVolume.loudnessRelease", {
                            value: (loudnessParamsByMode[mode]?.release ?? DEFAULT_LOUDNESS_PARAMS.release).toFixed(2),
                          })}
                        </Typography>
                        <Slider
                          value={loudnessParamsByMode[mode]?.release ?? DEFAULT_LOUDNESS_PARAMS.release}
                          min={0.01}
                          max={0.9}
                          step={0.01}
                          onChange={(_, v) =>
                            setLoudnessParamsByMode((prev) => ({
                              ...prev,
                              [mode]: { ...(prev[mode] ?? DEFAULT_LOUDNESS_PARAMS), release: v as number },
                            }))
                          }
                        />
                      </Box>
                    )}
                    {(mode === 15 || mode === 16) && (
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                          {t("displayVolume.wmpTrailTuning")}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() =>
                              setWmpTrailParamsByMode((prev) => ({
                                ...prev,
                                [mode]: { ...WMP_TRAIL_PRESETS.classic[mode as 15 | 16] },
                              }))
                            }
                          >
                            {t("displayVolume.presetWmpClassic")}
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() =>
                              setWmpTrailParamsByMode((prev) => ({
                                ...prev,
                                [mode]: { ...WMP_TRAIL_PRESETS.modern[mode as 15 | 16] },
                              }))
                            }
                          >
                            {t("displayVolume.presetWmpModern")}
                          </Button>
                        </Box>
                        <Typography gutterBottom>
                          {t("displayVolume.wmpTrailLength", {
                            value: (wmpTrailParamsByMode[mode]?.trailLength ?? defaultWmpTrailParamsForMode.trailLength).toFixed(0),
                          })}
                        </Typography>
                        <Slider
                          value={wmpTrailParamsByMode[mode]?.trailLength ?? defaultWmpTrailParamsForMode.trailLength}
                          min={2}
                          max={24}
                          step={1}
                          onChange={(_, v) =>
                            setWmpTrailParamsByMode((prev) => ({
                              ...prev,
                              [mode]: { ...(prev[mode] ?? defaultWmpTrailParamsForMode), trailLength: v as number },
                            }))
                          }
                        />
                        <Typography gutterBottom sx={{ mt: 2 }}>
                          {t("displayVolume.wmpTrailDecay", {
                            value: (wmpTrailParamsByMode[mode]?.trailDecay ?? defaultWmpTrailParamsForMode.trailDecay).toFixed(2),
                          })}
                        </Typography>
                        <Slider
                          value={wmpTrailParamsByMode[mode]?.trailDecay ?? defaultWmpTrailParamsForMode.trailDecay}
                          min={0.5}
                          max={0.99}
                          step={0.01}
                          onChange={(_, v) =>
                            setWmpTrailParamsByMode((prev) => ({
                              ...prev,
                              [mode]: { ...(prev[mode] ?? defaultWmpTrailParamsForMode), trailDecay: v as number },
                            }))
                          }
                        />
                        <Typography gutterBottom sx={{ mt: 2 }}>
                          {t("displayVolume.wmpAdditive", {
                            value: (wmpTrailParamsByMode[mode]?.additive ?? defaultWmpTrailParamsForMode.additive).toFixed(2),
                          })}
                        </Typography>
                        <Slider
                          value={wmpTrailParamsByMode[mode]?.additive ?? defaultWmpTrailParamsForMode.additive}
                          min={0.2}
                          max={3}
                          step={0.05}
                          onChange={(_, v) =>
                            setWmpTrailParamsByMode((prev) => ({
                              ...prev,
                              [mode]: { ...(prev[mode] ?? defaultWmpTrailParamsForMode), additive: v as number },
                            }))
                          }
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
                      max={5.0}
                      step={0.1}
                      marks={[
                        { value: 0.1, label: "0.1" },
                        { value: 1.0, label: "1.0" },
                        { value: 2.0, label: "2.0" },
                        { value: 5.0, label: "5.0" },
                      ]}
                    />
                    <Typography gutterBottom sx={{ mt: 3 }}>
                      {t("displayVolume.scaleY", { value: modeAdjustments.scaleY.toFixed(2) })}
                    </Typography>
                    <Slider
                      value={modeAdjustments.scaleY}
                      onChange={(_, value) => handleAdjustmentChange("scaleY", value as number)}
                      min={0.1}
                      max={5.0}
                      step={0.1}
                      marks={[
                        { value: 0.1, label: "0.1" },
                        { value: 1.0, label: "1.0" },
                        { value: 2.0, label: "2.0" },
                        { value: 5.0, label: "5.0" },
                      ]}
                    />
                    <Typography gutterBottom sx={{ mt: 3 }}>
                      {t("displayVolume.offsetX", {
                        value: Math.round(modeAdjustments.offsetX),
                        px: Math.round((getCanvasDimensions(activeCanvasLayout).width * modeAdjustments.offsetX) / 100),
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
                        value: Math.round(modeAdjustments.offsetY),
                        px: Math.round((getCanvasDimensions(activeCanvasLayout).height * modeAdjustments.offsetY) / 100),
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
                    {effectType !== "none" && effectType !== "dust" && ALL_EFFECT_STRENGTH_TYPES.includes(effectType) && (
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
                    {effectType === "dust" && (
                      <Box sx={{ width: "100%", maxWidth: 440, mt: 1.5, mx: "auto" }}>
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.atmosphereStrength", { value: atmosphereStrength })}
                        </Typography>
                        <Slider
                          value={atmosphereStrength}
                          min={1}
                          max={100}
                          step={1}
                          onChange={(_, v) => setAtmosphereStrength(v as number)}
                        />
                      </Box>
                    )}
                    {isSpaceEffect && (
                      <>
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
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "center", alignItems: "center", mt: 1 }}>
                          <Typography variant="caption" color="textSecondary">
                            {t("effect.spaceDirection")}
                          </Typography>
                          <Button
                            variant={spaceDirection === "forward" ? "contained" : "outlined"}
                            onClick={() => setSpaceDirection("forward")}
                            size="small"
                          >
                            {t("effect.spaceForward")}
                          </Button>
                          <Button
                            variant={spaceDirection === "backward" ? "contained" : "outlined"}
                            onClick={() => setSpaceDirection("backward")}
                            size="small"
                          >
                            {t("effect.spaceBackward")}
                          </Button>
                        </Box>
                        <Box sx={{ width: "100%", maxWidth: 440, mt: 1, mx: "auto" }}>
                          <Typography variant="caption" color="textSecondary" display="block">
                            {t("effect.spaceSpeed", { value: spaceSpeed.toFixed(2) })}
                          </Typography>
                          <Slider
                            value={spaceSpeed}
                            min={0.2}
                            max={3}
                            step={0.05}
                            onChange={(_, v) => setSpaceSpeed(v as number)}
                          />
                        </Box>
                        <Box sx={{ width: "100%", maxWidth: 440, mt: 2, mx: "auto" }}>
                          <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 0.5 }}>
                            {t("effect.weatherColor")}
                          </Typography>
                          <Box sx={paletteGridSx}>
                            {DEFAULT_COLOR_PALETTE_20.map((c) => (
                              <Box
                                key={`space-${c}`}
                                component="button"
                                type="button"
                                aria-label={`${t("effect.space")} ${c}`}
                                onClick={() => {
                                  const u = c.toUpperCase();
                                  setSpaceParticleColor(u);
                                  setSpaceColorInput(u);
                                }}
                                sx={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 0.75,
                                  border:
                                    spaceParticleColor.toUpperCase() === c.toUpperCase()
                                      ? "2px solid #111"
                                      : "1px solid #999",
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
                            value={spaceColorInput}
                            onChange={(e) => {
                              const next = normalizeHexColorInput(e.target.value);
                              setSpaceColorInput(next);
                              if (isHexColorCode(next)) {
                                setSpaceParticleColor(next);
                              }
                            }}
                            error={spaceColorInput.length > 0 && !isHexColorCode(spaceColorInput)}
                            helperText={
                              spaceColorInput.length > 0 && !isHexColorCode(spaceColorInput)
                                ? t("effect.weatherColorCodeInvalid")
                                : " "
                            }
                            inputProps={{ inputMode: "text", pattern: "#?[0-9a-fA-F]{6}" }}
                            sx={{ width: 220, mt: 0.5 }}
                          />
                        </Box>
                      </>
                    )}
                    {effectType === "sparkle" && (
                      <Box sx={{ width: "100%", maxWidth: 440, mt: 2, mx: "auto" }}>
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "center", alignItems: "center", mb: 1 }}>
                          <Typography variant="caption" color="textSecondary">
                            {t("effect.sparkleType")}
                          </Typography>
                          <Button
                            variant={sparkleVariant === "normal" ? "contained" : "outlined"}
                            onClick={() => setSparkleVariant("normal")}
                            size="small"
                          >
                            {t("effect.sparkleNormal")}
                          </Button>
                          <Button
                            variant={sparkleVariant === "heart" ? "contained" : "outlined"}
                            onClick={() => setSparkleVariant("heart")}
                            size="small"
                          >
                            {t("effect.sparkleHeart")}
                          </Button>
                          <Button
                            variant={sparkleVariant === "star" ? "contained" : "outlined"}
                            onClick={() => setSparkleVariant("star")}
                            size="small"
                          >
                            {t("effect.sparkleStar")}
                          </Button>
                        </Box>
                        <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 0.5 }}>
                          {t("effect.weatherColor")}
                        </Typography>
                        <Box sx={paletteGridSx}>
                          {DEFAULT_COLOR_PALETTE_20.map((c) => (
                            <Box
                              key={`sparkle-${c}`}
                              component="button"
                              type="button"
                              aria-label={`${t("effect.sparkle")} ${c}`}
                              onClick={() => {
                                const u = c.toUpperCase();
                                setSparkleParticleColor(u);
                                setSparkleColorInput(u);
                              }}
                              sx={{
                                width: 28,
                                height: 28,
                                borderRadius: 0.75,
                                border:
                                  sparkleParticleColor.toUpperCase() === c.toUpperCase()
                                    ? "2px solid #111"
                                    : "1px solid #999",
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
                          value={sparkleColorInput}
                          onChange={(e) => {
                            const next = normalizeHexColorInput(e.target.value);
                            setSparkleColorInput(next);
                            if (isHexColorCode(next)) {
                              setSparkleParticleColor(next);
                            }
                          }}
                          error={sparkleColorInput.length > 0 && !isHexColorCode(sparkleColorInput)}
                          helperText={
                            sparkleColorInput.length > 0 && !isHexColorCode(sparkleColorInput)
                              ? t("effect.weatherColorCodeInvalid")
                              : " "
                          }
                          inputProps={{ inputMode: "text", pattern: "#?[0-9a-fA-F]{6}" }}
                          sx={{ width: 220, mt: 0.5 }}
                        />
                      </Box>
                    )}
                    {effectType === "dust" && (
                      <Box sx={{ width: "100%", maxWidth: 440, mt: 2, mx: "auto" }}>
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "center", alignItems: "center", mb: 1 }}>
                          <Typography variant="caption" color="textSecondary">
                            {t("effect.atmosphereType")}
                          </Typography>
                          <Button
                            variant={atmosphereVariant === "dust" ? "contained" : "outlined"}
                            onClick={() => setAtmosphereVariant("dust")}
                            size="small"
                          >
                            {t("effect.atmosphereDust")}
                          </Button>
                          <Button
                            variant={atmosphereVariant === "sparks" ? "contained" : "outlined"}
                            onClick={() => setAtmosphereVariant("sparks")}
                            size="small"
                          >
                            {t("effect.atmosphereSparks")}
                          </Button>
                          <Button
                            variant={atmosphereVariant === "fireflies" ? "contained" : "outlined"}
                            onClick={() => setAtmosphereVariant("fireflies")}
                            size="small"
                          >
                            {t("effect.atmosphereFireflies")}
                          </Button>
                        </Box>
                        <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 0.5 }}>
                          {t("effect.weatherColor")}
                        </Typography>
                        <Box sx={paletteGridSx}>
                          {DEFAULT_COLOR_PALETTE_20.map((c) => (
                            <Box
                              key={`dust-${c}`}
                              component="button"
                              type="button"
                              aria-label={`${t("effect.dust")} ${c}`}
                              onClick={() => {
                                const u = c.toUpperCase();
                                setDustParticleColor(u);
                                setDustColorInput(u);
                              }}
                              sx={{
                                width: 28,
                                height: 28,
                                borderRadius: 0.75,
                                border:
                                  dustParticleColor.toUpperCase() === c.toUpperCase()
                                    ? "2px solid #111"
                                    : "1px solid #999",
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
                          value={dustColorInput}
                          onChange={(e) => {
                            const next = normalizeHexColorInput(e.target.value);
                            setDustColorInput(next);
                            if (isHexColorCode(next)) {
                              setDustParticleColor(next);
                            }
                          }}
                          error={dustColorInput.length > 0 && !isHexColorCode(dustColorInput)}
                          helperText={
                            dustColorInput.length > 0 && !isHexColorCode(dustColorInput)
                              ? t("effect.weatherColorCodeInvalid")
                              : " "
                          }
                          inputProps={{ inputMode: "text", pattern: "#?[0-9a-fA-F]{6}" }}
                          sx={{ width: 220, mt: 0.5 }}
                        />
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
                          <Box sx={paletteGridSx}>
                            {DEFAULT_COLOR_PALETTE_20.map((c) => (
                              <Box
                                key={`rain-${c}`}
                                component="button"
                                type="button"
                                aria-label={`${t("effect.weatherColor")} ${c}`}
                                onClick={() => setRainWeather((p) => ({ ...p, color: c }))}
                                sx={{
                                  width: 28,
                                  height: 28,
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
                          <Box sx={paletteGridSx}>
                            {DEFAULT_COLOR_PALETTE_20.map((c) => (
                              <Box
                                key={`snow-${c}`}
                                component="button"
                                type="button"
                                aria-label={`${t("effect.weatherColor")} ${c}`}
                                onClick={() => setSnowWeather((p) => ({ ...p, color: c }))}
                                sx={{
                                  width: 28,
                                  height: 28,
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
                    {effectType === "mirrorBall" && (
                      <Box sx={{ width: "100%", maxWidth: 480, mt: 1.5, mx: "auto" }}>
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallPosX", { value: Math.round(mirrorBall.ballX * 100) })}
                        </Typography>
                        <Slider
                          value={mirrorBall.ballX}
                          min={0.05}
                          max={0.95}
                          step={0.01}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, ballX: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallPosY", { value: Math.round(mirrorBall.ballY * 100) })}
                        </Typography>
                        <Slider
                          value={mirrorBall.ballY}
                          min={0.08}
                          max={0.92}
                          step={0.01}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, ballY: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallRotation", { value: mirrorBall.rotationSpeed.toFixed(0) })}
                        </Typography>
                        <Slider
                          value={mirrorBall.rotationSpeed}
                          min={-120}
                          max={120}
                          step={1}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, rotationSpeed: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallRadius", { value: Math.round(mirrorBall.radius * 100) })}
                        </Typography>
                        <Slider
                          value={mirrorBall.radius}
                          min={0.04}
                          max={0.35}
                          step={0.01}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, radius: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallFacets", { value: mirrorBall.facetCount })}
                        </Typography>
                        <Slider
                          value={mirrorBall.facetCount}
                          min={8}
                          max={64}
                          step={1}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, facetCount: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallSparkle", { value: Math.round(mirrorBall.sparkle * 100) })}
                        </Typography>
                        <Slider
                          value={mirrorBall.sparkle}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, sparkle: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallBeams", { value: mirrorBall.beamCount })}
                        </Typography>
                        <Slider
                          value={mirrorBall.beamCount}
                          min={4}
                          max={32}
                          step={1}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, beamCount: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallBeamSpread", { value: Math.round(mirrorBall.beamSpread) })}
                        </Typography>
                        <Slider
                          value={mirrorBall.beamSpread}
                          min={8}
                          max={90}
                          step={1}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, beamSpread: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallAmbient", { value: Math.round(mirrorBall.ambient * 100) })}
                        </Typography>
                        <Slider
                          value={mirrorBall.ambient}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, ambient: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallSpecular", { value: Math.round(mirrorBall.specular * 100) })}
                        </Typography>
                        <Slider
                          value={mirrorBall.specular}
                          min={0.05}
                          max={1}
                          step={0.01}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, specular: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallReflectivity", { value: Math.round(mirrorBall.reflectivity * 100) })}
                        </Typography>
                        <Slider
                          value={mirrorBall.reflectivity}
                          min={0.1}
                          max={1}
                          step={0.01}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, reflectivity: v as number }))}
                        />
                        <Divider sx={{ my: 1.5 }} />
                        <Typography variant="caption" color="textSecondary" fontWeight={600} display="block">
                          {t("effect.mirrorBallPrimaryLight")}
                        </Typography>
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallLightPosX", { value: Math.round(mirrorBall.lightX * 100) })}
                        </Typography>
                        <Slider
                          value={mirrorBall.lightX}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, lightX: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallLightPosY", { value: Math.round(mirrorBall.lightY * 100) })}
                        </Typography>
                        <Slider
                          value={mirrorBall.lightY}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, lightY: v as number }))}
                        />
                        <Typography variant="caption" color="textSecondary" display="block">
                          {t("effect.mirrorBallLightIntensity", { value: Math.round(mirrorBall.lightIntensity * 100) })}
                        </Typography>
                        <Slider
                          value={mirrorBall.lightIntensity}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(_, v) => setMirrorBall((p) => ({ ...p, lightIntensity: v as number }))}
                        />
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 0.5 }}>
                            {t("effect.weatherColor")}
                          </Typography>
                          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, justifyContent: "center" }}>
                            {DEFAULT_COLOR_PALETTE_20.map((c) => (
                              <button
                                key={`mb-light-${c}`}
                                type="button"
                                aria-label={`${t("effect.mirrorBallPrimaryLight")} ${c}`}
                                onClick={() => {
                                  setMirrorBall((p) => ({ ...p, lightColor: c }));
                                  setMirrorBallLightColorInput(c.toUpperCase());
                                }}
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 4,
                                  background: c,
                                  cursor: "pointer",
                                  border:
                                    mirrorBall.lightColor.toUpperCase() === c.toUpperCase()
                                      ? "2px solid #111"
                                      : "1px solid #999",
                                }}
                              />
                            ))}
                          </Box>
                          <TextField
                            size="small"
                            label={t("effect.weatherColorCode")}
                            value={mirrorBallLightColorInput}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              setMirrorBallLightColorInput(v.startsWith("#") ? v.toUpperCase() : `#${v}`.toUpperCase());
                              if (/^#[0-9A-F]{6}$/.test(v.startsWith("#") ? v.toUpperCase() : `#${v}`.toUpperCase())) {
                                setMirrorBall((p) => ({
                                  ...p,
                                  lightColor: v.startsWith("#") ? v.toUpperCase() : `#${v}`.toUpperCase(),
                                }));
                              }
                            }}
                            error={
                              mirrorBallLightColorInput.length > 0 &&
                              !/^#?[0-9A-F]{6}$/.test(mirrorBallLightColorInput.replace(/^#/, ""))
                            }
                            helperText={
                              mirrorBallLightColorInput.length > 0 &&
                              !/^#?[0-9A-F]{6}$/.test(mirrorBallLightColorInput.replace(/^#/, ""))
                                ? t("effect.weatherColorCodeInvalid")
                                : " "
                            }
                            inputProps={{ inputMode: "text", pattern: "#?[0-9a-fA-F]{6}" }}
                            sx={{ width: 220, mt: 1 }}
                          />
                        </Box>
                        <Divider sx={{ my: 1.5 }} />
                        <FormControlLabel
                          control={
                            <Switch
                              checked={mirrorBall.secondaryEnabled}
                              onChange={(_, c) => setMirrorBall((p) => ({ ...p, secondaryEnabled: c }))}
                              size="small"
                            />
                          }
                          label={t("effect.mirrorBallSecondaryLight")}
                        />
                        {mirrorBall.secondaryEnabled && (
                          <>
                            <Typography variant="caption" color="textSecondary" display="block">
                              {t("effect.mirrorBallLightPosX", { value: Math.round(mirrorBall.secondaryX * 100) })}
                            </Typography>
                            <Slider
                              value={mirrorBall.secondaryX}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(_, v) => setMirrorBall((p) => ({ ...p, secondaryX: v as number }))}
                            />
                            <Typography variant="caption" color="textSecondary" display="block">
                              {t("effect.mirrorBallLightPosY", { value: Math.round(mirrorBall.secondaryY * 100) })}
                            </Typography>
                            <Slider
                              value={mirrorBall.secondaryY}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(_, v) => setMirrorBall((p) => ({ ...p, secondaryY: v as number }))}
                            />
                            <Typography variant="caption" color="textSecondary" display="block">
                              {t("effect.mirrorBallSecondaryIntensity", {
                                value: Math.round(mirrorBall.secondaryIntensity * 100),
                              })}
                            </Typography>
                            <Slider
                              value={mirrorBall.secondaryIntensity}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(_, v) => setMirrorBall((p) => ({ ...p, secondaryIntensity: v as number }))}
                            />
                            <Box sx={{ mt: 1 }}>
                              <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 0.5 }}>
                                {t("effect.weatherColor")}
                              </Typography>
                              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, justifyContent: "center" }}>
                                {DEFAULT_COLOR_PALETTE_20.map((c) => (
                                  <button
                                    key={`mb-sec-${c}`}
                                    type="button"
                                    aria-label={`${t("effect.mirrorBallSecondaryLight")} ${c}`}
                                    onClick={() => {
                                      setMirrorBall((p) => ({ ...p, secondaryColor: c }));
                                      setMirrorBallSecondaryColorInput(c.toUpperCase());
                                    }}
                                    style={{
                                      width: 22,
                                      height: 22,
                                      borderRadius: 4,
                                      background: c,
                                      cursor: "pointer",
                                      border:
                                        mirrorBall.secondaryColor.toUpperCase() === c.toUpperCase()
                                          ? "2px solid #111"
                                          : "1px solid #999",
                                    }}
                                  />
                                ))}
                              </Box>
                              <TextField
                                size="small"
                                label={t("effect.weatherColorCode")}
                                value={mirrorBallSecondaryColorInput}
                                onChange={(e) => {
                                  const v = e.target.value.trim();
                                  setMirrorBallSecondaryColorInput(
                                    v.startsWith("#") ? v.toUpperCase() : `#${v}`.toUpperCase()
                                  );
                                  if (/^#[0-9A-F]{6}$/.test(v.startsWith("#") ? v.toUpperCase() : `#${v}`.toUpperCase())) {
                                    setMirrorBall((p) => ({
                                      ...p,
                                      secondaryColor: v.startsWith("#") ? v.toUpperCase() : `#${v}`.toUpperCase(),
                                    }));
                                  }
                                }}
                                error={
                                  mirrorBallSecondaryColorInput.length > 0 &&
                                  !/^#?[0-9A-F]{6}$/.test(mirrorBallSecondaryColorInput.replace(/^#/, ""))
                                }
                                helperText={
                                  mirrorBallSecondaryColorInput.length > 0 &&
                                  !/^#?[0-9A-F]{6}$/.test(mirrorBallSecondaryColorInput.replace(/^#/, ""))
                                    ? t("effect.weatherColorCodeInvalid")
                                    : " "
                                }
                                inputProps={{ inputMode: "text", pattern: "#?[0-9a-fA-F]{6}" }}
                                sx={{ width: 220, mt: 1 }}
                              />
                            </Box>
                          </>
                        )}
                        <FormControlLabel
                          sx={{ mt: 1 }}
                          control={
                            <Switch
                              checked={mirrorBall.audioSyncRotation}
                              onChange={(_, c) => setMirrorBall((p) => ({ ...p, audioSyncRotation: c }))}
                              size="small"
                            />
                          }
                          label={t("effect.mirrorBallAudioSync")}
                        />
                      </Box>
                    )}
                  </AccordionDetails>
                </Accordion>
              </Box>
            )}

            {settingsTab === 2 && (
              <Box sx={{ width: "100%", maxWidth: 600, margin: "0 auto", py: 1 }}>
                <Typography variant="body2" sx={{ mb: 2, textAlign: "center", fontWeight: 500 }}>
                  {t("titleTab.title")}
                </Typography>
                <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                  {t("titleTab.caption")}
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={6}
                  size="small"
                  label={t("titleTab.textLabel")}
                  value={titleText}
                  onChange={(e) => setTitleText(e.target.value.slice(0, 500))}
                  placeholder={t("titleTab.placeholder")}
                  sx={{ mb: 2 }}
                />
                <FormControlLabel
                  control={<Switch checked={titleEnabled} onChange={(_, c) => setTitleEnabled(c)} size="small" />}
                  label={t("titleTab.enabled")}
                  sx={{ mb: 2, display: "flex", alignItems: "center" }}
                />
                <Typography gutterBottom>{t("titleTab.positionY", { value: titleStyle.positionYPercent.toFixed(0) })}</Typography>
                <Slider
                  value={titleStyle.positionYPercent}
                  min={5}
                  max={98}
                  step={1}
                  onChange={(_, v) => setTitleStyle((prev) => ({ ...prev, positionYPercent: v as number }))}
                />
                <FormControl size="small" fullWidth sx={{ mt: 1.5, mb: 1.5 }}>
                  <InputLabel>{t("titleTab.align")}</InputLabel>
                  <Select
                    value={titleStyle.align}
                    label={t("titleTab.align")}
                    onChange={(e) => setTitleStyle((prev) => ({ ...prev, align: e.target.value as TitleStyle["align"] }))}
                  >
                    <MenuItem value="left">{t("subtitle.alignLeft")}</MenuItem>
                    <MenuItem value="center">{t("subtitle.alignCenter")}</MenuItem>
                    <MenuItem value="right">{t("subtitle.alignRight")}</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                  <InputLabel>{t("titleTab.displayType")}</InputLabel>
                  <Select
                    value={titleStyle.displayType}
                    label={t("titleTab.displayType")}
                    onChange={(e) => setTitleStyle((prev) => ({ ...prev, displayType: e.target.value as TitleStyle["displayType"] }))}
                  >
                    <MenuItem value="plain">{t("subtitle.typePlain")}</MenuItem>
                    <MenuItem value="outline">{t("subtitle.typeOutline")}</MenuItem>
                    <MenuItem value="boxed">{t("subtitle.typeBoxed")}</MenuItem>
                  </Select>
                </FormControl>
                <Typography gutterBottom>{t("titleTab.fontSize", { value: titleStyle.fontSize.toFixed(0) })}</Typography>
                <Slider
                  value={titleStyle.fontSize}
                  min={12}
                  max={200}
                  step={1}
                  onChange={(_, v) => setTitleStyle((prev) => ({ ...prev, fontSize: v as number }))}
                />
                <Typography gutterBottom sx={{ mt: 2 }}>{t("titleTab.letterSpacing", { value: titleStyle.letterSpacingPx.toFixed(0) })}</Typography>
                <Slider
                  value={titleStyle.letterSpacingPx}
                  min={0}
                  max={24}
                  step={1}
                  onChange={(_, v) => setTitleStyle((prev) => ({ ...prev, letterSpacingPx: v as number }))}
                />
                <FormControl size="small" fullWidth sx={{ mt: 1.5, mb: 1.5 }}>
                  <InputLabel>{t("titleTab.fontFamily")}</InputLabel>
                  <Select
                    value={titleStyle.fontFamily}
                    label={t("titleTab.fontFamily")}
                    onChange={(e) => setTitleStyle((prev) => ({ ...prev, fontFamily: String(e.target.value) }))}
                  >
                    <MenuItem value="sans-serif">sans-serif</MenuItem>
                    <MenuItem value="serif">serif</MenuItem>
                    <MenuItem value="monospace">monospace</MenuItem>
                    <MenuItem value="'Noto Sans JP', sans-serif">Noto Sans JP</MenuItem>
                  </Select>
                </FormControl>
                <Box sx={{ display: "flex", gap: 2, mb: 1.5 }}>
                  <FormControlLabel
                    control={<Switch checked={titleStyle.bold} onChange={(_, c) => setTitleStyle((p) => ({ ...p, bold: c }))} size="small" />}
                    label={t("subtitle.bold")}
                  />
                  <FormControlLabel
                    control={<Switch checked={titleStyle.italic} onChange={(_, c) => setTitleStyle((p) => ({ ...p, italic: c }))} size="small" />}
                    label={t("subtitle.italic")}
                  />
                </Box>
                <TextField
                  size="small"
                  fullWidth
                  label={t("titleTab.textColor")}
                  value={titleStyle.color}
                  onChange={(e) => setTitleStyle((p) => ({ ...p, color: normalizeHexColorInput(e.target.value) }))}
                  sx={{ mb: 1.5 }}
                />
                <TextField
                  size="small"
                  fullWidth
                  label={t("titleTab.strokeColor")}
                  value={titleStyle.strokeColor}
                  onChange={(e) => setTitleStyle((p) => ({ ...p, strokeColor: normalizeHexColorInput(e.target.value) }))}
                  sx={{ mb: 1.5 }}
                />
                <Typography gutterBottom>{t("titleTab.strokeWidth", { value: titleStyle.strokeWidth.toFixed(1) })}</Typography>
                <Slider
                  value={titleStyle.strokeWidth}
                  min={0}
                  max={12}
                  step={0.5}
                  onChange={(_, v) => setTitleStyle((prev) => ({ ...prev, strokeWidth: v as number }))}
                />
                <TextField
                  size="small"
                  fullWidth
                  label={t("titleTab.shadowColor")}
                  value={titleStyle.shadowColor}
                  onChange={(e) => setTitleStyle((p) => ({ ...p, shadowColor: e.target.value }))}
                  sx={{ mb: 1.5, mt: 2 }}
                />
                <Typography gutterBottom>{t("titleTab.shadowBlur", { value: titleStyle.shadowBlur.toFixed(0) })}</Typography>
                <Slider
                  value={titleStyle.shadowBlur}
                  min={0}
                  max={40}
                  step={1}
                  onChange={(_, v) => setTitleStyle((prev) => ({ ...prev, shadowBlur: v as number }))}
                />
                <TextField
                  size="small"
                  fullWidth
                  label={t("titleTab.boxColor")}
                  value={titleStyle.boxColor}
                  onChange={(e) => setTitleStyle((p) => ({ ...p, boxColor: e.target.value }))}
                  sx={{ mb: 1.5 }}
                />
                <Typography gutterBottom>{t("titleTab.boxPadding", { value: titleStyle.boxPadding.toFixed(0) })}</Typography>
                <Slider
                  value={titleStyle.boxPadding}
                  min={0}
                  max={40}
                  step={1}
                  onChange={(_, v) => setTitleStyle((prev) => ({ ...prev, boxPadding: v as number }))}
                />
                <FormControl size="small" fullWidth sx={{ mt: 1.5, mb: 1.5 }}>
                  <InputLabel>{t("titleTab.animationType")}</InputLabel>
                  <Select
                    value={titleStyle.animationType}
                    label={t("titleTab.animationType")}
                    onChange={(e) => setTitleStyle((prev) => ({ ...prev, animationType: e.target.value as TitleStyle["animationType"] }))}
                  >
                    <MenuItem value="none">{t("subtitle.animNone")}</MenuItem>
                    <MenuItem value="fade">{t("subtitle.animFade")}</MenuItem>
                    <MenuItem value="slideUp">{t("subtitle.animSlideUp")}</MenuItem>
                    <MenuItem value="pop">{t("subtitle.animPop")}</MenuItem>
                  </Select>
                </FormControl>
                <Typography gutterBottom>{t("titleTab.animationDuration", { value: titleStyle.animationDurationSec.toFixed(2) })}</Typography>
                <Slider
                  value={titleStyle.animationDurationSec}
                  min={0}
                  max={1.5}
                  step={0.05}
                  onChange={(_, v) => setTitleStyle((prev) => ({ ...prev, animationDurationSec: v as number }))}
                />
              </Box>
            )}

            {settingsTab === 3 && (
              <Box sx={{ width: "100%", maxWidth: 600, margin: "0 auto", py: 1 }}>
                <Typography variant="body2" sx={{ mb: 2, textAlign: "center", fontWeight: 500 }}>
                  {t("subtitle.title")}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1.5 }}>
                  <Button variant="outlined" component="label" size="small">
                    {t("subtitle.selectSrt")}
                    <input type="file" accept=".srt,text/plain" onChange={subtitleLoad} hidden />
                  </Button>
                  <Typography variant="caption" color="textSecondary">
                    {subtitleFileName || t("dropZone.unselected")}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    border: "1px dashed",
                    borderColor: "divider",
                    borderRadius: 1,
                    p: 1.2,
                    mb: 1.5,
                    fontSize: 12,
                    color: "text.secondary",
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const f = Array.from(e.dataTransfer.files).find((x) => isSrtFileByName(x.name));
                    if (!f) {
                      openSnackBar(t("snackbar.subtitleTypeNotSupported"));
                      return;
                    }
                    await loadSubtitleFile(f);
                  }}
                >
                  {t("subtitle.dropSrt")}
                </Box>

                {srtAuthorPanelEnabled && (
                <Accordion defaultExpanded={false} sx={{ mb: 1.5 }}>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {t("subtitle.author.sectionTitle")}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                      {t("subtitle.author.hint")}
                    </Typography>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      minRows={4}
                      label={t("subtitle.author.lyricsLabel")}
                      placeholder={t("subtitle.author.lyricsPlaceholder")}
                      value={srtAuthorLyricsRaw}
                      onChange={(e) => setSrtAuthorLyricsRaw(e.target.value)}
                      sx={{ mb: 1 }}
                    />
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                      <Button variant="outlined" size="small" onClick={srtAuthorReflectLyrics}>
                        {t("subtitle.author.reflectLyrics")}
                      </Button>
                      <Button variant="outlined" size="small" component="label">
                        {t("subtitle.author.loadTxt")}
                        <input type="file" accept=".txt,.lrc,text/plain" hidden onChange={lyricsTxtLoad} />
                      </Button>
                      <Button variant="outlined" size="small" onClick={srtAuthorEvenSplitAgain} disabled={srtAuthorCues.length === 0}>
                        {t("subtitle.author.evenSplit")}
                      </Button>
                    </Box>
                    <Typography gutterBottom>{t("subtitle.author.globalOffset", { value: srtAuthorGlobalOffsetMs })}</Typography>
                    <Slider
                      value={srtAuthorGlobalOffsetMs}
                      min={-3000}
                      max={3000}
                      step={50}
                      onChange={(_, v) => setSrtAuthorGlobalOffsetMs(v as number)}
                      sx={{ mb: 1.5 }}
                    />
                    <Box
                      ref={srtRecordPanelRef}
                      tabIndex={-1}
                      sx={{ outline: srtAuthorRecordActive ? "2px solid" : "none", outlineColor: "primary.main", borderRadius: 1, p: 1, mb: 1, bgcolor: "action.hover" }}
                    >
                      <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 0.5 }}>
                        {t("subtitle.author.recordHint")}
                      </Typography>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={srtAuthorRecordActive}
                            onChange={(_, c) => {
                              if (c) {
                                if (srtAuthorCues.length === 0) {
                                  openSnackBar(t("snackbar.subtitleAuthorNoCues"));
                                  return;
                                }
                                setSrtAuthorRecordActive(true);
                                setSrtAuthorLineIndex(0);
                                setSrtAuthorPhase("wait_start");
                                queueMicrotask(() => srtRecordPanelRef.current?.focus());
                                queueMicrotask(() => ensureSrtAuthorCueRowsInView());
                              } else {
                                setSrtAuthorRecordActive(false);
                              }
                            }}
                            size="small"
                          />
                        }
                        label={t("subtitle.author.recordMode")}
                        sx={{ mb: 1, display: "block" }}
                      />
                      {srtAuthorCues.length > 0 && srtAuthorLineIndex < srtAuthorCues.length && (
                        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                          {srtAuthorPhase === "wait_start"
                            ? t("subtitle.author.statusWaitStart", {
                                current: srtAuthorLineIndex + 1,
                                total: srtAuthorCues.length,
                              })
                            : t("subtitle.author.statusInside", {
                                current: srtAuthorLineIndex + 1,
                                total: srtAuthorCues.length,
                              })}
                        </Typography>
                      )}
                      {srtAuthorCues.length > 0 && srtAuthorLineIndex < srtAuthorCues.length && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, whiteSpace: "pre-wrap" }}>
                          {srtAuthorCues[srtAuthorLineIndex]?.text ?? ""}
                        </Typography>
                      )}
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1 }}>
                        <Button
                          variant="contained"
                          color="primary"
                          size="medium"
                          disabled={!srtAuthorRecordActive || srtAuthorPhase !== "wait_start" || srtAuthorLineIndex >= srtAuthorCues.length}
                          onClick={srtAuthorOnBtnStartClick}
                        >
                          {t("subtitle.author.btnStart")}
                        </Button>
                        <Button
                          variant="contained"
                          color="secondary"
                          size="medium"
                          disabled={!srtAuthorRecordActive || srtAuthorPhase !== "inside_line" || srtAuthorLineIndex >= srtAuthorCues.length}
                          onClick={srtAuthorMarkEnd}
                        >
                          {t("subtitle.author.btnEnd")}
                        </Button>
                        <Tooltip title={t("subtitle.author.undoTooltip")}>
                          <span>
                            <Button variant="outlined" size="small" startIcon={<Undo />} onClick={srtAuthorUndoLast}>
                              {t("subtitle.author.undo")}
                            </Button>
                          </span>
                        </Tooltip>
                      </Box>
                    </Box>
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                      <Button variant="outlined" size="small" onClick={srtAuthorExportSrt} disabled={srtAuthorCues.length === 0}>
                        {t("subtitle.author.exportSrt")}
                      </Button>
                      <Button variant="contained" size="small" onClick={srtAuthorApplyToPreview} disabled={srtAuthorCues.length === 0}>
                        {t("subtitle.author.applyPreview")}
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          const mediaDur = getMediaDurationSec();
                          if (!(mediaDur > 0)) {
                            openSnackBar(t("snackbar.subtitleAuthorNeedAudio"));
                            return;
                          }
                          pushSrtAuthorUndoSnapshot();
                          const win = getPlaybackWindowBounds(resolvePlaybackWindow(), mediaDur);
                          setSrtAuthorCues((prev) => {
                            const last = prev[prev.length - 1];
                            const s = last ? Math.min(last.endSec, win.endSec - 0.06) : win.startSec;
                            const e = Math.min(win.endSec, s + 0.5);
                            return [...prev, { startSec: s, endSec: Math.max(s + 0.05, e), text: "" }];
                          });
                          openSnackBar(t("snackbar.subtitleAuthorLineAdded"));
                        }}
                      >
                        {t("subtitle.author.addLine")}
                      </Button>
                    </Box>
                    {srtAuthorCues.length > 0 && (
                      <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 0.5 }}>
                        {t("subtitle.author.cueListCaption")}
                      </Typography>
                    )}
                    <Box
                      ref={srtAuthorCueListRef}
                      sx={{ maxHeight: 240, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 0.5 }}
                    >
                      {srtAuthorCues.map((cue, index) => (
                        <Box
                          key={`srt-cue-${index}`}
                          ref={
                            index === srtAuthorLineIndex
                              ? srtAuthorActiveCueRowRef
                              : index === srtAuthorLineIndex + 1
                                ? srtAuthorNextCueRowRef
                                : undefined
                          }
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", sm: "94px 94px minmax(0, 1fr) 40px" },
                            gap: 0.5,
                            alignItems: "center",
                            mb: 0.5,
                            p: 0.5,
                            bgcolor: index === srtAuthorLineIndex && srtAuthorRecordActive ? "action.selected" : "transparent",
                            borderRadius: 0.5,
                          }}
                        >
                          {renderSrtAuthorTimeField(cue, index, "startSec", t("subtitle.author.startSec"))}
                          {renderSrtAuthorTimeField(cue, index, "endSec", t("subtitle.author.endSec"))}
                          <TextField
                            size="small"
                            fullWidth
                            label={t("subtitle.author.lineText")}
                            value={cue.text}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSrtAuthorCues((prev) => {
                                const next = [...prev];
                                if (!next[index]) return prev;
                                next[index] = { ...next[index], text: v };
                                return next;
                              });
                            }}
                            sx={{
                              "& .MuiInputBase-input": {
                                fontSize: "0.82rem",
                              },
                              "& .MuiInputLabel-root": {
                                fontSize: "0.82rem",
                              },
                            }}
                          />
                          <IconButton
                            size="small"
                            aria-label={t("subtitle.author.deleteLine")}
                            onClick={() => {
                              pushSrtAuthorUndoSnapshot();
                              setSrtAuthorCues((prev) => prev.filter((_, j) => j !== index));
                              setSrtAuthorLineIndex((li) => {
                                if (index < li) return Math.max(0, li - 1);
                                if (index === li) return Math.max(0, li);
                                return li;
                              });
                            }}
                          >
                            <DeleteSweep fontSize="small" />
                          </IconButton>
                        </Box>
                      ))}
                    </Box>
                  </AccordionDetails>
                </Accordion>
                )}

                <FormControlLabel
                  control={<Switch checked={subtitleEnabled} onChange={(_, c) => setSubtitleEnabled(c)} size="small" />}
                  label={t("subtitle.enabled")}
                  sx={{ mb: 1.5, display: "flex", alignItems: "center" }}
                />
                <Typography gutterBottom>{t("subtitle.positionY", { value: subtitleStyle.positionYPercent.toFixed(0) })}</Typography>
                <Slider
                  value={subtitleStyle.positionYPercent}
                  min={5}
                  max={98}
                  step={1}
                  onChange={(_, v) => setSubtitleStyle((prev) => ({ ...prev, positionYPercent: v as number }))}
                />
                <FormControl size="small" fullWidth sx={{ mt: 1.5, mb: 1.5 }}>
                  <InputLabel>{t("subtitle.align")}</InputLabel>
                  <Select
                    value={subtitleStyle.align}
                    label={t("subtitle.align")}
                    onChange={(e) =>
                      setSubtitleStyle((prev) => ({ ...prev, align: e.target.value as SubtitleStyle["align"] }))
                    }
                  >
                    <MenuItem value="left">{t("subtitle.alignLeft")}</MenuItem>
                    <MenuItem value="center">{t("subtitle.alignCenter")}</MenuItem>
                    <MenuItem value="right">{t("subtitle.alignRight")}</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                  <InputLabel>{t("subtitle.displayType")}</InputLabel>
                  <Select
                    value={subtitleStyle.displayType}
                    label={t("subtitle.displayType")}
                    onChange={(e) =>
                      setSubtitleStyle((prev) => ({ ...prev, displayType: e.target.value as SubtitleStyle["displayType"] }))
                    }
                  >
                    <MenuItem value="plain">{t("subtitle.typePlain")}</MenuItem>
                    <MenuItem value="outline">{t("subtitle.typeOutline")}</MenuItem>
                    <MenuItem value="boxed">{t("subtitle.typeBoxed")}</MenuItem>
                  </Select>
                </FormControl>
                <Typography gutterBottom>{t("subtitle.fontSize", { value: subtitleStyle.fontSize.toFixed(0) })}</Typography>
                <Slider
                  value={subtitleStyle.fontSize}
                  min={12}
                  max={96}
                  step={1}
                  onChange={(_, v) => setSubtitleStyle((prev) => ({ ...prev, fontSize: v as number }))}
                />
                <FormControl size="small" fullWidth sx={{ mt: 1.5, mb: 1.5 }}>
                  <InputLabel>{t("subtitle.fontFamily")}</InputLabel>
                  <Select
                    value={subtitleStyle.fontFamily}
                    label={t("subtitle.fontFamily")}
                    onChange={(e) => setSubtitleStyle((prev) => ({ ...prev, fontFamily: String(e.target.value) }))}
                  >
                    <MenuItem value="sans-serif">sans-serif</MenuItem>
                    <MenuItem value="serif">serif</MenuItem>
                    <MenuItem value="monospace">monospace</MenuItem>
                    <MenuItem value="'Noto Sans JP', sans-serif">Noto Sans JP</MenuItem>
                  </Select>
                </FormControl>
                <Box sx={{ display: "flex", gap: 2, mb: 1.5 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={subtitleStyle.bold}
                        onChange={(_, c) => setSubtitleStyle((p) => ({ ...p, bold: c }))}
                        size="small"
                      />
                    }
                    label={t("subtitle.bold")}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={subtitleStyle.italic}
                        onChange={(_, c) => setSubtitleStyle((p) => ({ ...p, italic: c }))}
                        size="small"
                      />
                    }
                    label={t("subtitle.italic")}
                  />
                </Box>
                <TextField
                  size="small"
                  fullWidth
                  label={t("subtitle.color")}
                  value={subtitleStyle.color}
                  onChange={(e) => setSubtitleStyle((p) => ({ ...p, color: normalizeHexColorInput(e.target.value) }))}
                  sx={{ mb: 1.5 }}
                />
                <TextField
                  size="small"
                  fullWidth
                  label={t("subtitle.strokeColor")}
                  value={subtitleStyle.strokeColor}
                  onChange={(e) => setSubtitleStyle((p) => ({ ...p, strokeColor: normalizeHexColorInput(e.target.value) }))}
                  sx={{ mb: 1.5 }}
                />
                <Typography gutterBottom>{t("subtitle.strokeWidth", { value: subtitleStyle.strokeWidth.toFixed(1) })}</Typography>
                <Slider
                  value={subtitleStyle.strokeWidth}
                  min={0}
                  max={12}
                  step={0.5}
                  onChange={(_, v) => setSubtitleStyle((prev) => ({ ...prev, strokeWidth: v as number }))}
                />
                <FormControl size="small" fullWidth sx={{ mt: 1.5, mb: 1.5 }}>
                  <InputLabel>{t("subtitle.animationType")}</InputLabel>
                  <Select
                    value={subtitleStyle.animationType}
                    label={t("subtitle.animationType")}
                    onChange={(e) =>
                      setSubtitleStyle((prev) => ({ ...prev, animationType: e.target.value as SubtitleStyle["animationType"] }))
                    }
                  >
                    <MenuItem value="none">{t("subtitle.animNone")}</MenuItem>
                    <MenuItem value="fade">{t("subtitle.animFade")}</MenuItem>
                    <MenuItem value="slideUp">{t("subtitle.animSlideUp")}</MenuItem>
                    <MenuItem value="pop">{t("subtitle.animPop")}</MenuItem>
                  </Select>
                </FormControl>
                <Typography gutterBottom>
                  {t("subtitle.animationDuration", { value: subtitleStyle.animationDurationSec.toFixed(2) })}
                </Typography>
                <Slider
                  value={subtitleStyle.animationDurationSec}
                  min={0}
                  max={1.5}
                  step={0.05}
                  onChange={(_, v) => setSubtitleStyle((prev) => ({ ...prev, animationDurationSec: v as number }))}
                />
                <Typography gutterBottom>
                  {t("subtitle.displayTimingOffset", {
                    value:
                      subtitleDisplayTimingOffsetSec >= 0
                        ? `+${subtitleDisplayTimingOffsetSec.toFixed(2)}`
                        : subtitleDisplayTimingOffsetSec.toFixed(2),
                  })}
                </Typography>
                <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 0.5 }}>
                  {t("subtitle.displayTimingOffsetHint")}
                </Typography>
                <Slider
                  value={subtitleDisplayTimingOffsetSec}
                  min={-2}
                  max={2}
                  step={0.05}
                  onChange={(_, v) => setSubtitleDisplayTimingOffsetSec(v as number)}
                />
              </Box>
            )}

            {settingsTab === 4 && (
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

            {settingsTab === 5 && (
              <div className={styles.effectButtons} style={{ paddingTop: 8 }}>
                <Typography variant="body2" sx={{ mb: 1, textAlign: "center", fontWeight: 500 }}>
                  {t("shortOutput.title")}
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    alignItems: "center",
                  }}
                >
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
                        setShortDurationSecStr("180");
                      }}
                      size="small"
                      sx={{ height: 36, textTransform: "none" }}
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
                      sx={{ height: 36, textTransform: "none" }}
                    >
                      {t("shortOutput.niconico")}
                    </Button>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
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
                      placeholder={shortOutputPreset === "all" ? "" : t("shortOutput.durationPlaceholder")}
                      sx={{ width: 140, "& .MuiInputBase-root": { height: 36 } }}
                      inputProps={{ inputMode: "decimal" }}
                    />
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
                    <TextField
                      label={t("shortOutput.fadeInSec")}
                      size="small"
                      value={shortFadeInSecStr}
                      onChange={(e) => setShortFadeInSecStr(e.target.value)}
                      disabled={shortOutputPreset === "all"}
                      sx={{ width: 120, "& .MuiInputBase-root": { height: 36 } }}
                      inputProps={{ inputMode: "decimal", min: 0, step: 0.1 }}
                    />
                    <TextField
                      label={t("shortOutput.fadeOutSec")}
                      size="small"
                      value={shortFadeOutSecStr}
                      onChange={(e) => setShortFadeOutSecStr(e.target.value)}
                      disabled={shortOutputPreset === "all"}
                      sx={{ width: 120, "& .MuiInputBase-root": { height: 36 } }}
                      inputProps={{ inputMode: "decimal", min: 0, step: 0.1 }}
                    />
                  </Box>
                </Box>
                {shortOutputPreset !== "all" && (
                  <Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 0.5, textAlign: "center" }}>
                    {t("shortOutput.hint")}
                  </Typography>
                )}
              </div>
            )}

            {settingsTab === 6 && (
              <Box sx={{ width: "100%", maxWidth: 800, margin: "0 auto", py: 1 }}>
                <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                  {t("resolution.title")}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 3 }}>
                  <Button
                    variant={canvasSize === "auto" ? "contained" : "outlined"}
                    onClick={() => onChangeCanvasSize({ target: { value: "auto" } } as SelectChangeEvent<string>)}
                    size="small"
                    disabled={isQuickEncoding || isRecording}
                  >
                    {t("resolution.auto")}
                  </Button>
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
                {canvasSize === "auto" && (
                  <Typography variant="caption" color="textSecondary" sx={{ display: "block", mb: 2 }}>
                    {t("resolution.autoHint")}
                  </Typography>
                )}
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                  {t("videoQuality.title")}
                </Typography>
                <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                  {t("videoQuality.presetSectionHint")}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setTargetLufs(-14);
                      setTargetLufsCustom("-14");
                      setExportAudioBitrateKbps(320);
                      setRecordAudioBitrateKbps(384);
                      setRecordVideoBitrateMbps(8);
                    }}
                    sx={{ textTransform: "none", height: 36 }}
                  >
                    {t("videoQuality.presetDistribution")}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setTargetLufs(-14);
                      setTargetLufsCustom("-14");
                      setExportAudioBitrateKbps(320);
                      setRecordAudioBitrateKbps(384);
                      setRecordVideoBitrateMbps(14);
                    }}
                    sx={{ textTransform: "none", height: 36 }}
                  >
                    {t("videoQuality.presetHifi")}
                  </Button>
                </Box>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  {t("videoQuality.outputResolution", {
                    width: getCanvasDimensions(activeCanvasLayout).width,
                    height: getCanvasDimensions(activeCanvasLayout).height,
                  })}
                </Typography>
                <Typography gutterBottom>
                  {t("videoQuality.videoBitrate", { value: recordVideoBitrateMbps })}
                </Typography>
                <Slider
                  value={recordVideoBitrateMbps}
                  min={1}
                  max={40}
                  step={0.5}
                  onChange={(_, v) => setRecordVideoBitrateMbps(v as number)}
                />
                <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
                  {t("videoQuality.videoBitrateHint")}
                </Typography>
                <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
                  {t("videoQuality.recordContainerFixedMp4")}
                </Typography>
                <FormControl size="small" fullWidth sx={{ mb: 1, maxWidth: 360 }}>
                  <InputLabel>{t("videoQuality.audioBitrate")}</InputLabel>
                  <Select
                    value={exportAudioBitrateKbps}
                    label={t("videoQuality.audioBitrate")}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (isExportAudioBitrateKbps(v)) {
                        setExportAudioBitrateKbps(v);
                        setRecordAudioBitrateKbps(null);
                      }
                    }}
                  >
                    <MenuItem value={128}>128 kbps</MenuItem>
                    <MenuItem value={192}>192 kbps</MenuItem>
                    <MenuItem value={256}>256 kbps</MenuItem>
                    <MenuItem value={320}>320 kbps</MenuItem>
                  </Select>
                </FormControl>
                <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
                  {t("videoQuality.audioBitrateHint")}
                </Typography>
                {recordAudioBitrateKbps != null && recordAudioBitrateKbps !== exportAudioBitrateKbps && (
                  <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
                    {t("videoQuality.recordAudioBitrate", { value: recordAudioBitrateKbps })}
                  </Typography>
                )}
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={srtAuthorPanelEnabled}
                      onChange={(_, checked) => {
                        setSrtAuthorPanelEnabled(checked);
                        if (!checked) {
                          setSrtAuthorRecordActive(false);
                        }
                      }}
                      disabled={isQuickEncoding || isRecording}
                    />
                  }
                  label="SRT"
                  sx={{ display: "block", mb: 2, ml: 0, alignItems: "center" }}
                />
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
                </Box>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                  {t("settings.title")}
                </Typography>
                <Box sx={{ width: "100%", maxWidth: 600, margin: "0 auto" }}>
                  <Typography variant="body2" gutterBottom>
                    {t("settings.current", { mode, size: canvasSize === "auto" ? t("resolution.auto") : activeCanvasLayout })}
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
                          setTargetLufs(-14);
                          setTargetLufsCustom("-14");
                          setModeAdjustments(DEFAULT_ADJUSTMENTS);
                          setSrtAuthorPanelEnabled(false);
                          setSrtAuthorRecordActive(false);
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

        <div className={`${styles.canvasWrapper} rounded-2xl border border-slate-200/80 bg-white/90 px-3 pb-3 pt-2 shadow-sm md:px-4 md:pb-4 dark:border-slate-600/50 dark:bg-slate-900/80 dark:shadow-md`}>
          <div className="flex justify-center py-5 px-2 md:py-7 md:px-4">
            <canvas
              key={rendererType}
              className={styles.canvas}
              ref={canvasRef}
              data-size={activeCanvasLayout}
            ></canvas>
          </div>

          <div className={`${styles.menu__right} mt-3 rounded-xl bg-slate-50/70 p-3 dark:bg-slate-800/80`}>
            <Box sx={{ display: "flex", gap: 1.5, justifyContent: "center", flexWrap: "wrap", mt: 1 }}>
            <Button
              variant="outlined"
              startIcon={<VideoLibrary />}
              disabled={playSoundDisabled || isQuickEncoding}
              onClick={onPlaySound}
              size="medium"
            >
              {isPlaySound ? t("buttons.stop") : t("buttons.preview")}
            </Button>
            <Button
              variant="outlined"
              startIcon={<FiberManualRecord />}
              disabled={recordMovieDisabled || isPlaySound || isQuickEncoding}
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
          {isQuickEncoding && quickEncodingProgress && (
            <Box sx={{ mt: 2, width: "100%" }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                <Typography variant="body2" color="textSecondary">
                  {quickEncodingProgress.message}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {Math.round(quickEncodingProgress.progress)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={quickEncodingProgress.progress}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
          )}
          </div>

          <div className={`${styles.canvasInfo} mt-1 rounded-md dark:bg-slate-800/70`}>
            <Typography variant="caption" color="textSecondary">
              {t("recordSize", {
              width: getCanvasDimensions(activeCanvasLayout).width,
              height: getCanvasDimensions(activeCanvasLayout).height,
            })}
            </Typography>
          </div>
        </div>
      </main>

      <Dialog
        open={dialogSrtAuthorApplyConfirm}
        onClose={() => setDialogSrtAuthorApplyConfirm(false)}
      >
        <DialogTitle>{t("dialog.srtAuthorApplyConfirmTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t("dialog.srtAuthorApplyConfirmBody")}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogSrtAuthorApplyConfirm(false)}>
            {t("dialog.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setDialogSrtAuthorApplyConfirm(false);
              srtAuthorApplyToPreview();
            }}
          >
            {t("dialog.srtAuthorApplyConfirmApply")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={dialogClearGalleryForVideo}
        onClose={() => {
          pendingVideoBackgroundFileRef.current = null;
          setDialogClearGalleryForVideo(false);
        }}
      >
        <DialogTitle>{t("dialog.clearGalleryForVideoTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t("dialog.clearGalleryForVideoBody")}</Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              pendingVideoBackgroundFileRef.current = null;
              setDialogClearGalleryForVideo(false);
            }}
          >
            {t("dialog.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const f = pendingVideoBackgroundFileRef.current;
              pendingVideoBackgroundFileRef.current = null;
              setDialogClearGalleryForVideo(false);
              if (f) {
                applyBackgroundMp4File(f);
              }
            }}
          >
            {t("dialog.confirmReplaceWithVideo")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={dialogDroppedVideoChoice}
        onClose={() => {
          void handleDroppedVideoChoice("cancel");
        }}
      >
        <DialogTitle>{t("dialog.droppedVideoChoiceTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t("dialog.droppedVideoChoiceBody")}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void handleDroppedVideoChoice("cancel")}>
            {t("dialog.cancel")}
          </Button>
          <Button onClick={() => void handleDroppedVideoChoice("audio")}>
            {t("dialog.loadDroppedVideoAsAudio")}
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleDroppedVideoChoice("background")}
          >
            {t("dialog.loadDroppedVideoAsBackground")}
          </Button>
        </DialogActions>
      </Dialog>

      <CustomSnackbar
        {...snackBarProps}
        handleClose={handleClose}
      ></CustomSnackbar>

      <footer className={`${styles.footer} mt-8 rounded-xl border border-slate-200/70 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-slate-600/50 dark:bg-slate-900/75 dark:shadow-md`}>
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
    </ThemeProvider>
  );
};

export default Home;
