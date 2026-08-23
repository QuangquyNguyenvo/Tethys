export type CommandItem = {
  id: string;
  title: string;
  category: "Layout" | "Widget" | "Terminal" | "Preview" | "Theme" | "Settings";
  shortcut?: string;
  action: () => void | Promise<void>;
};
