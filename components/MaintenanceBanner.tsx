import { Box, Typography } from "@mui/material";
import {
  MAINTENANCE_MESSAGE,
  MAINTENANCE_MODE,
  MAINTENANCE_SUBMESSAGE,
} from "../lib/maintenance";

export const MAINTENANCE_BANNER_HEIGHT_PX = 72;

export const MaintenanceBanner = () => {
  if (!MAINTENANCE_MODE) return null;

  return (
    <Box
      component="div"
      role="status"
      aria-live="polite"
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        bgcolor: "error.main",
        color: "error.contrastText",
        minHeight: MAINTENANCE_BANNER_HEIGHT_PX,
        py: 1.25,
        px: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        boxShadow: 4,
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
        <Typography
          variant="h6"
          component="p"
          sx={{
            m: 0,
            fontWeight: 800,
            letterSpacing: "0.04em",
            fontSize: { xs: "1.125rem", sm: "1.35rem" },
            lineHeight: 1.3,
          }}
        >
          {MAINTENANCE_MESSAGE}
        </Typography>
        <Typography
          component="p"
          sx={{
            m: 0,
            fontWeight: 600,
            letterSpacing: "0.02em",
            fontSize: { xs: "0.8125rem", sm: "0.9375rem" },
            lineHeight: 1.35,
            opacity: 0.95,
          }}
        >
          {MAINTENANCE_SUBMESSAGE}
        </Typography>
      </Box>
    </Box>
  );
};
