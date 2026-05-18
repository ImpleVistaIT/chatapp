import { useEffect, useState } from "react";

export default function TypingText({ text = "", speed = 20 }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!text) return;

    let i = 0;
    setDisplayed("");

    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));

      if (i >= text.length) {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return <span>{displayed}</span>;
}