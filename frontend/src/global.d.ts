declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

// Vite: import a file's text with "?raw" (legal documents)
declare module '*?raw' {
  const content: string;
  export default content;
}
