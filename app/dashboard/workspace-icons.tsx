const paths = {
  brand: "M3 17l6-6 4 4 8-11 M15 4h6v6", overview: "M3 10l9-7 9 7v11h-6v-7H9v7H3z",
  websites: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c-5 5-5 13 0 18 M12 3c5 5 5 13 0 18",
  scan: "M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  improvements: "M14.7 6.3a4 4 0 0 0-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5l-2.3 2.3-3-3z",
  reports: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h6 M9 16h4",
  tools: "M4 20V10h4v10 M10 20V5h4v15 M16 20v-7h4v7 M2 20h20",
  connections: "M10 14l4-4 M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0 M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  help: "M12 17h.01 M9 9a3 3 0 1 1 4.5 2.6c-1 .5-1.5 1-1.5 2.4 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  account: "M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M4 21v-3a8 8 0 0 1 16 0v3", back: "M20 12H4 M10 6l-6 6 6 6",
  menu: "M4 6h16 M4 12h16 M4 18h16", close: "M6 6l12 12 M6 18L18 6", more: "M5 12h.01 M12 12h.01 M19 12h.01",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  chevron: "M9 5l7 7-7 7", down: "M6 9l6 6 6-6", plus: "M12 5v14 M5 12h14",
  issue: "M12 7v6 M12 17h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", image: "M3 4h18v16H3z M3 16l6-6 5 5 3-3 4 4 M15 8h.01",
  code: "M8 6l-6 6 6 6 M16 6l6 6-6 6", bolt: "M13 2L4 14h7l-1 8 10-13h-8z", lock: "M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4",
  contact: "M3 5h18v14H3z M3 6l9 7 9-7", review: "M12 3l3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 10l6-1z", check: "M5 12l4 4L20 5"
};
export type WorkspaceIconName = keyof typeof paths;
export function WorkspaceIcon({ name, className = "" }: { name: WorkspaceIconName; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
