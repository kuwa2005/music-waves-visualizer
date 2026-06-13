import { useEffect, useReducer, type RefObject } from "react";
import { AccessTime, HourglassBottom } from "@mui/icons-material";
import { Box, Slider as MuiSlider, Typography } from "@mui/material";

const PREVIEW_SEEK_THUMB_PX = 18;

function formatPlaybackMmSs(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function previewSeekTrackRatio(value: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(1, value / duration));
}

type PreviewTimeline = {
  start: number;
  duration: number;
};

export type PreviewSeekBarProps = {
  playSoundDisabled: boolean;
  isPlaySound: boolean;
  isPlaybackFadingOut: boolean;
  isRecording: boolean;
  isQuickEncoding: boolean;
  audioFileName: string;
  seekAriaLabel: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  isPlaySoundRef: RefObject<boolean>;
  isPlaybackFadingOutRef: RefObject<boolean>;
  resolvePreviewTimeline: () => PreviewTimeline | null;
  getPreviewPlayheadSec: () => number;
  seekPreviewToRelative: (relativeSec: number) => void;
};

export function PreviewSeekBar({
  playSoundDisabled,
  isPlaySound,
  isPlaybackFadingOut,
  isRecording,
  isQuickEncoding,
  audioFileName,
  seekAriaLabel,
  videoRef,
  isPlaySoundRef,
  isPlaybackFadingOutRef,
  resolvePreviewTimeline,
  getPreviewPlayheadSec,
  seekPreviewToRelative,
}: PreviewSeekBarProps) {
  const [, bumpUi] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (playSoundDisabled) return;
    const video = videoRef.current;
    const bump = () => bumpUi();
    if (video) {
      video.addEventListener("timeupdate", bump);
      video.addEventListener("seeked", bump);
    }
    let raf = 0;
    if ((isPlaySound || isPlaybackFadingOut) && !video) {
      const loop = () => {
        if (isPlaySoundRef.current || isPlaybackFadingOutRef.current) bump();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      if (video) {
        video.removeEventListener("timeupdate", bump);
        video.removeEventListener("seeked", bump);
      }
      if (raf) cancelAnimationFrame(raf);
    };
  }, [
    playSoundDisabled,
    isPlaySound,
    isPlaybackFadingOut,
    audioFileName,
    videoRef,
    isPlaySoundRef,
    isPlaybackFadingOutRef,
  ]);

  useEffect(() => {
    if (!isPlaybackFadingOut) return;
    const video = videoRef.current;
    if (!video) return;
    let raf = 0;
    const loop = () => {
      if (isPlaybackFadingOutRef.current) bumpUi();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaybackFadingOut, videoRef, isPlaybackFadingOutRef]);

  const previewTimeline = resolvePreviewTimeline();
  const previewSeekValue =
    previewTimeline != null
      ? Math.max(0, Math.min(previewTimeline.duration, getPreviewPlayheadSec() - previewTimeline.start))
      : 0;

  const previewBufferedRelative =
    previewTimeline != null &&
    previewTimeline.duration > 0 &&
    videoRef.current &&
    videoRef.current.buffered.length > 0
      ? (() => {
          const tl = previewTimeline;
          const video = videoRef.current;
          if (!video) return 0;
          const currentAbs = tl.start + previewSeekValue;
          for (let i = 0; i < video.buffered.length; i += 1) {
            const start = video.buffered.start(i);
            const end = video.buffered.end(i);
            if (currentAbs >= start && currentAbs <= end) {
              return Math.max(0, Math.min(tl.duration, end - tl.start));
            }
          }
          return previewSeekValue;
        })()
      : 0;

  const previewSeekDisabled =
    playSoundDisabled ||
    isRecording ||
    isQuickEncoding ||
    previewTimeline == null ||
    previewTimeline.duration <= 0;

  const previewSeekDuration =
    previewTimeline != null && previewTimeline.duration > 0 ? previewTimeline.duration : 0;
  const previewSeekBarMax = previewSeekDuration > 0 ? previewSeekDuration : 1;
  const previewSeekBarStep =
    previewSeekDuration > 0 ? Math.max(0.01, previewSeekDuration / 500) : 0.01;
  const previewSeekRatio = previewSeekTrackRatio(previewSeekValue, previewSeekDuration);
  const previewBufferRatio = previewSeekTrackRatio(previewBufferedRelative, previewSeekDuration);
  const previewBufferDisplayRatio = Math.max(previewSeekRatio, previewBufferRatio);

  const handleSeek = (relativeSec: number) => {
    seekPreviewToRelative(relativeSec);
    bumpUi();
  };

  return (
    <Box className="preview-seek-bar" sx={{ width: "100%", maxWidth: 480, mx: "auto", px: 0, pb: 1 }}>
      <Box
        sx={(theme) => ({
          width: "100%",
          borderRadius: 4,
          px: { xs: 1.25, sm: 1.75 },
          py: 1,
          background:
            theme.palette.mode === "dark"
              ? "linear-gradient(140deg, rgba(15,23,42,0.86), rgba(30,41,59,0.8))"
              : "linear-gradient(140deg, rgba(255,255,255,0.9), rgba(248,250,252,0.82))",
          border: `1px solid ${
            theme.palette.mode === "dark" ? "rgba(148,163,184,0.28)" : "rgba(148,163,184,0.22)"
          }`,
          boxShadow:
            theme.palette.mode === "dark"
              ? "0 10px 24px rgba(2,6,23,0.45), inset 0 1px 0 rgba(255,255,255,0.05)"
              : "0 10px 24px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.6)",
          backdropFilter: "blur(8px)",
        })}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.55, gap: 1 }}>
          <Box sx={{ display: "inline-flex", alignItems: "center", minWidth: 0, gap: 0.5 }}>
            <AccessTime sx={{ fontSize: 14, color: "text.secondary", opacity: 0.92, flexShrink: 0 }} />
            <Typography
              variant="caption"
              aria-live="polite"
              sx={{ color: "text.secondary", fontWeight: 600, letterSpacing: 0.25, fontVariantNumeric: "tabular-nums" }}
            >
              {formatPlaybackMmSs(previewSeekValue)}
            </Typography>
          </Box>
          <Box sx={{ display: "inline-flex", alignItems: "center", minWidth: 0, gap: 0.5 }}>
            <HourglassBottom sx={{ fontSize: 14, color: "text.secondary", opacity: 0.85, flexShrink: 0 }} />
            <Typography
              variant="caption"
              sx={{ color: "text.secondary", fontWeight: 600, letterSpacing: 0.25, fontVariantNumeric: "tabular-nums" }}
            >
              {formatPlaybackMmSs(previewSeekDuration)}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ position: "relative", pb: 0.25 }}>
          <MuiSlider
            size="small"
            value={previewSeekValue}
            min={0}
            max={previewSeekBarMax}
            step={previewSeekBarStep}
            disabled={previewSeekDisabled}
            onChange={(_, v) => handleSeek(v as number)}
            onChangeCommitted={(_, v) => handleSeek(v as number)}
            aria-label={seekAriaLabel}
            sx={(theme) => {
              const railBg =
                theme.palette.mode === "dark" ? "rgba(148,163,184,0.22)" : "rgba(148,163,184,0.3)";
              const bufferBg =
                theme.palette.mode === "dark" ? "rgba(100,116,139,0.42)" : "rgba(148,163,184,0.45)";
              const bufPct = previewBufferDisplayRatio * 100;
              return {
                position: "relative",
                zIndex: 1,
                height: 8,
                boxSizing: "content-box",
                padding: "6px 0",
                "& .MuiSlider-rail": {
                  opacity: 1,
                  height: 8,
                  borderRadius: 3,
                  background: railBg,
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: "100%",
                    width: `${bufPct}%`,
                    borderRadius: "inherit",
                    pointerEvents: "none",
                    background: bufferBg,
                  },
                },
                "& .MuiSlider-track": {
                  height: 8,
                  border: "none",
                  borderRadius: 3,
                  zIndex: 1,
                  transition: "none",
                  background:
                    theme.palette.mode === "dark"
                      ? "linear-gradient(90deg, #22d3ee 0%, #818cf8 55%, #a78bfa 100%)"
                      : "linear-gradient(90deg, #0ea5e9 0%, #6366f1 55%, #8b5cf6 100%)",
                  boxShadow:
                    theme.palette.mode === "dark"
                      ? "0 0 0 1px rgba(255,255,255,0.05), 0 0 12px rgba(56,189,248,0.45)"
                      : "0 0 0 1px rgba(255,255,255,0.5), 0 0 10px rgba(99,102,241,0.35)",
                },
                "& .MuiSlider-thumb": {
                  width: PREVIEW_SEEK_THUMB_PX,
                  height: PREVIEW_SEEK_THUMB_PX,
                  borderRadius: 4,
                  border: `2px solid ${theme.palette.mode === "dark" ? "rgba(15,23,42,0.95)" : "#ffffff"}`,
                  backgroundColor: theme.palette.mode === "dark" ? "#e2e8f0" : "#f8fafc",
                  boxShadow:
                    theme.palette.mode === "dark"
                      ? "0 2px 10px rgba(0,0,0,0.55), 0 0 0 0 rgba(125,211,252,0.45)"
                      : "0 2px 10px rgba(30,41,59,0.28), 0 0 0 0 rgba(99,102,241,0.35)",
                  transition: "transform 130ms ease, box-shadow 130ms ease",
                  transform: "translate(-50%, -50%)",
                  "&:hover, &.Mui-active": {
                    transform: "translate(-50%, -50%) scale(1.08)",
                    boxShadow:
                      theme.palette.mode === "dark"
                        ? "0 3px 14px rgba(0,0,0,0.65), 0 0 0 7px rgba(56,189,252,0.18)"
                        : "0 3px 14px rgba(30,41,59,0.35), 0 0 0 7px rgba(99,102,241,0.16)",
                  },
                  "&.Mui-focusVisible": {
                    transform: "translate(-50%, -50%)",
                    boxShadow:
                      theme.palette.mode === "dark"
                        ? "0 0 0 8px rgba(56,189,248,0.26), 0 0 0 2px rgba(15,23,42,0.95)"
                        : "0 0 0 8px rgba(59,130,246,0.26), 0 0 0 2px #ffffff",
                  },
                },
                "& .MuiSlider-valueLabel": {
                  bgcolor: "transparent",
                  color: "text.secondary",
                },
                "&.Mui-disabled": {
                  opacity: 0.6,
                  "& .MuiSlider-thumb": {
                    boxShadow: "none",
                  },
                },
              };
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}
