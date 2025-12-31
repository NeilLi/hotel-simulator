import { Room, Agent } from "../types";

export function getTheme(atmosphere: string) {
  const isGolden = atmosphere === "GOLDEN_HOUR";
  const isNight = atmosphere === "MIDNIGHT_LOUNGE";
  const isEvening = atmosphere === "EVENING_CHIC";

  // Holographic Palette
  const colors = {
    bg: "#020617", // Deep Void
    
    // The "Floor" grid color
    grid: isGolden ? "rgba(251, 191, 36, 0.15)" : "rgba(6, 182, 212, 0.1)",
    gridStrong: isGolden ? "rgba(251, 191, 36, 0.3)" : "rgba(6, 182, 212, 0.2)",
    
    // Room footprints
    roomFill: isNight ? "rgba(15, 23, 42, 0.4)" : "rgba(8, 51, 68, 0.3)",
    roomBorder: isGolden ? "rgba(251, 191, 36, 0.4)" : "rgba(34, 211, 238, 0.3)",
    
    // Agents
    agentRobot: "#06b6d4", // Cyan-500
    agentHuman: "#fbbf24", // Amber-400
    
    // Text
    text: "rgba(148, 163, 184, 0.8)",
    textHighlight: "rgba(226, 232, 240, 1)",
  };

  return colors;
}

export function getCoordinates(entity: Room | Agent) {
  // Normalize coordinates for the 80x44 grid
  if ('topLeft' in entity) {
    // It's a room
    const r = entity as Room;
    return {
      x: r.topLeft.x,
      y: r.topLeft.y,
      w: (r.bottomRight?.x ?? r.topLeft.x) - r.topLeft.x + 1,
      h: (r.bottomRight?.y ?? r.topLeft.y) - r.topLeft.y + 1
    };
  } else {
    // It's an agent
    const a = entity as Agent;
    const x = a.position?.x ?? 0;
    const y = a.position?.y ?? 0;
    
    // Calculate heading
    let rotation = 0;
    if (a.previousPosition) {
       const dx = x - a.previousPosition.x;
       const dy = y - a.previousPosition.y;
       if (dx !== 0 || dy !== 0) {
         rotation = Math.atan2(dy, dx) * (180 / Math.PI);
       }
    }
    
    return { x, y, rotation };
  }
}