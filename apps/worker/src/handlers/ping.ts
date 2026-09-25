import type { Handler } from "./types";

export const ping: Handler = async () => {
  console.log("ping ok");
};
