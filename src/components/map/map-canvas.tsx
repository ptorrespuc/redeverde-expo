import { Platform } from "react-native";

import type { MapCanvasHandle, MapCanvasProps } from "./map-canvas.types";

const implementation =
  Platform.OS === "web"
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("./map-canvas.web").MapCanvas
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    : require("./map-canvas.native").MapCanvas;

export const MapCanvas = implementation as React.ForwardRefExoticComponent<
  MapCanvasProps & React.RefAttributes<MapCanvasHandle>
>;
