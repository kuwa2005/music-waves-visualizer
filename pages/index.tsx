import "./@types/window.d";
import type { NextPage } from "next";
import styles from "../styles/Home.module.scss";

import { useState, useRef, useEffect } from "react";
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
} from "@mui/material";
import {
  FiberManualRecord,
  LibraryMusic,
  PhotoLibrary,
  VideoLibrary,
  ExpandMore,
} from "@mui/icons-material";
import { CustomSnackbar } from "../components/CustomSnackbar";
import { drawBars, clearImageCache, getFPS } from "../lib/Canvas";
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
    // Node接続
    audioBufferSourceNode.connect(analyserRef.current);
    analyserRef.current.connect(audioCtxRef.current.destination);
    analyserRef.current.connect(streamDestinationRef.current);
    audioBufferSourceNode.connect(audioCtxRef.current.destination);
    audioBufferSourceNode.connect(streamDestinationRef.current);
    audioBufferSrcRef.current = audioBufferSourceNode;
  };

  // 開発者モードフラグ（環境変数で制御）
  const isDeveloperMode =
    process.env.NEXT_PUBLIC_DEVELOPER_MODE === "true" ||
    process.env.NEXT_PUBLIC_DEV_MODE === "true";

  // Mode
  const [mode, setMode] = useState(0);
  
  // Canvas Size
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

  // 設定の保存キー生成
  const getSettingsKey = (mode: number, size: CanvasSize) => {
    return `spectrumSettings_${mode}_${size}`;
  };

  // 設定を保存
  const saveSettings = (mode: number, size: CanvasSize, adjustments: ModeAdjustments) => {
    try {
      const key = getSettingsKey(mode, size);
      localStorage.setItem(key, JSON.stringify(adjustments));
    } catch (error) {
      console.error("設定の保存に失敗しました:", error);
    }
  };

  // 設定を読み込み
  const loadSettings = (mode: number, size: CanvasSize): ModeAdjustments | null => {
    try {
      const key = getSettingsKey(mode, size);
      const saved = localStorage.getItem(key);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error("設定の読み込みに失敗しました:", error);
    }
    return null;
  };

  // すべての設定をエクスポート
  const exportAllSettings = (): string => {
    const allSettings: Record<string, ModeAdjustments> = {};
    const modes = [0, 1, 2, 3, 4, 5, 6];
    const sizes: CanvasSize[] = ["1920x1080", "1080x1920", "1920x1920"];

    modes.forEach((m) => {
      sizes.forEach((s) => {
        const key = getSettingsKey(m, s);
        const saved = localStorage.getItem(key);
        if (saved) {
          allSettings[key] = JSON.parse(saved);
        }
      });
    });

    return JSON.stringify(allSettings, null, 2);
  };

  // 設定をインポート
  const importAllSettings = (jsonString: string): boolean => {
    try {
      const allSettings = JSON.parse(jsonString);
      Object.keys(allSettings).forEach((key) => {
        localStorage.setItem(key, JSON.stringify(allSettings[key]));
      });
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
      saveSettings(mode, canvasSize, newAdjustments);
      return newAdjustments;
    });
  };

  const onChangeMode = (event: SelectChangeEvent<string>) => {
    const newMode = Number(event.target.value);
    // 現在の設定を保存してからモードを変更
    saveSettings(mode, canvasSize, modeAdjustments);
    setMode(newMode);
    // 新しいモードの設定を読み込み
    const loaded = loadSettings(newMode, canvasSize);
    if (loaded) {
      setModeAdjustments(loaded);
    }
  };

  const onChangeCanvasSize = (event: SelectChangeEvent<string>) => {
    const newSize = event.target.value as CanvasSize;
    // 現在の設定を保存してからサイズを変更
    saveSettings(mode, canvasSize, modeAdjustments);
    setCanvasSize(newSize);
    // 新しいサイズの設定を読み込み
    const loaded = loadSettings(mode, newSize);
    if (loaded) {
      setModeAdjustments(loaded);
    }
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

  // 初期設定の読み込み
  useEffect(() => {
    const loaded = loadSettings(mode, canvasSize);
    if (loaded) {
      setModeAdjustments(loaded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update canvas size when canvasSize changes or on mount
  useEffect(() => {
    if (canvasRef.current) {
      const dimensions = getCanvasDimensions(canvasSize);
      canvasRef.current.width = dimensions.width;
      canvasRef.current.height = dimensions.height;
      // キャンバスサイズ変更時に画像キャッシュをクリア
      clearImageCache();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize]);
  
  // Canvas Animation
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    reqIdRef.current = requestAnimationFrame(function () {
      return drawBars(
        canvasRef.current,
        imageCtx,
        mode,
        analyserRef.current,
        modeAdjustments
      );
    });
    return () => cancelAnimationFrame(reqIdRef.current);
  }, [imageCtx, mode, modeAdjustments]);

  // FPS表示更新（1秒ごとに更新）
  useEffect(() => {
    const fpsInterval = setInterval(() => {
      setFps(getFPS());
    }, 1000);
    return () => clearInterval(fpsInterval);
  }, []);

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
      console.log(e);
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
          const source = audioCtxRef.current.createMediaElementSource(video);
          source.connect(analyserRef.current);
          analyserRef.current.connect(audioCtxRef.current.destination);
          analyserRef.current.connect(streamDestinationRef.current);
          
          // 再生終了時の処理
          video.onended = () => {
            setIsPlaySound(false);
            if (reqIdRef.current) {
              cancelAnimationFrame(reqIdRef.current);
            }
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
      if (reqIdRef.current) {
        cancelAnimationFrame(reqIdRef.current);
      }
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

        openSnackBar(
          "動画をmp4に変換しています...（時間がかかります、ブラウザ検証ツールにログがでます）"
        );
        const webmBlob = new Blob(recordedBlobs, { type: "video/webm" });
        const binaryData = new Uint8Array(await webmBlob.arrayBuffer());
        const video = await generateMp4Video(binaryData, webmName, mp4Name);
        const mp4Blob = new Blob([video], { type: "video/mp4" });
        const objectURL = URL.createObjectURL(mp4Blob);

        const a = document.createElement("a");
        a.href = objectURL;
        a.download = mp4Name;
        a.click();
        a.remove();
        openSnackBar("動画の変換が完了しました！");
        setRecordMovieDisabled(false);
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
        };
      } else if (audioBufferSrcRef.current) {
        audioBufferSrcRef.current.onended = () => {
          recorder.stop();
          setIsRecording(false);
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

  return (
    <>
      <main>
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
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 500 }}>
            ファイルをドラッグ&ドロップ（複数ファイル対応）
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "stretch" }}>
            <Box sx={{ display: "flex", gap: 2, alignItems: "center", justifyContent: "center", width: "100%" }}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<PhotoLibrary />}
                size="medium"
                sx={{ flexShrink: 0 }}
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
            <Box sx={{ display: "flex", gap: 2, alignItems: "center", justifyContent: "center", width: "100%" }}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<LibraryMusic />}
                size="medium"
                sx={{ flexShrink: 0 }}
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
          <Typography variant="caption" color="textSecondary" sx={{ mt: 2, display: "block" }}>
            画像ファイルと音楽ファイルを自動判定します。MP4は音楽ファイルとして扱われます。
          </Typography>
        </div>

        <div className={styles.menu}>
          <div className={styles.menu__controls}>
            <div className={styles.spectrumButtons}>
              <Typography variant="body2" sx={{ mb: 1, textAlign: "center", fontWeight: 500 }}>
                スペクトラムアナライザー
              </Typography>
              <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap" }}>
                {[
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
              <Typography variant="body2" sx={{ mb: 1, textAlign: "center", fontWeight: 500 }}>
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
          </div>
          <div className={styles.menu__right}>
            <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
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
            </Box>
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
              <Typography>表示調整</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ width: "100%", maxWidth: 600, margin: "0 auto" }}>
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
            className={styles.canvas}
            ref={canvasRef}
            data-size={canvasSize}
          ></canvas>
          <div className={styles.canvasInfo}>
            <Typography variant="caption" color="textSecondary">
              録画サイズ: {getCanvasDimensions(canvasSize).width}×{getCanvasDimensions(canvasSize).height}px
            </Typography>
          </div>
        </div>
      </main>

      <CustomSnackbar
        {...snackBarProps}
        handleClose={handleClose}
      ></CustomSnackbar>

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
                設定は自動保存されます。モードや解像度を変更すると、対応する設定が自動的に読み込まれます。
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
                      navigator.clipboard.writeText(json);
                      openSnackBar("設定をクリップボードにコピーしました");
                    }
                  }}
                >
                  エクスポート
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    navigator.clipboard.readText().then((text) => {
                      if (importAllSettings(text)) {
                        // 現在の設定を再読み込み
                        const loaded = loadSettings(mode, canvasSize);
                        if (loaded) {
                          setModeAdjustments(loaded);
                        }
                        openSnackBar("設定をインポートしました");
                      } else {
                        openSnackBar("設定のインポートに失敗しました");
                      }
                    });
                  }}
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
                placeholder='{"spectrumSettings_0_1920x1080": {...}}'
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    if (importAllSettings(e.target.value)) {
                      const loaded = loadSettings(mode, canvasSize);
                      if (loaded) {
                        setModeAdjustments(loaded);
                      }
                      openSnackBar("設定を適用しました");
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
                      const modes = [0, 1, 2, 3, 4, 5, 6];
                      const sizes: CanvasSize[] = ["1920x1080", "1080x1920", "1920x1920"];
                      modes.forEach((m) => {
                        sizes.forEach((s) => {
                          localStorage.removeItem(getSettingsKey(m, s));
                        });
                      });
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
    </>
  );
};

export default Home;
