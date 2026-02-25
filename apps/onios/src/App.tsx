import { useEffect } from "react";
import { Desktop } from "./shell/Desktop";
import { commandRegistry } from "./core/CommandRegistry";
import { registerAllCommands } from "./core/registerCommands";

export function App() {
  useEffect(() => {
    registerAllCommands(commandRegistry);
  }, []);

  return <Desktop />;
}
