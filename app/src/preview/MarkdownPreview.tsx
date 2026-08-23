import React from "react";

type Props = {
  content: string;
};

export function MarkdownPreview({ content }: Props) {
  const elements = parseMarkdown(content);

  return (
    <div className="pv-markdown">
      <div className="md">{elements}</div>
    </div>
  );
}

function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = "";
  let listBuffer: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (listBuffer.length > 0) {
      nodes.push(
        <ul key={`${keyPrefix}-list-${nodes.length}`}>
          {listBuffer.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      listBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced Code Block start / end
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        const codeText = codeBuffer.join("\n");
        nodes.push(
          <pre key={`code-${i}`}>
            <code className={codeLang ? `lang-${codeLang}` : ""}>
              {codeLang === "diff" || codeLang === "patch"
                ? renderDiffCode(codeBuffer)
                : codeText}
            </code>
          </pre>,
        );
        codeBuffer = [];
        codeLang = "";
        inCodeBlock = false;
      } else {
        flushList(`before-code-${i}`);
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // List item
    const listMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (listMatch) {
      listBuffer.push(listMatch[2]);
      continue;
    } else {
      flushList(`flush-${i}`);
    }

    // Headings
    if (line.startsWith("# ")) {
      nodes.push(<h1 key={`h1-${i}`}>{renderInline(line.slice(2))}</h1>);
      continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<h2 key={`h2-${i}`}>{renderInline(line.slice(3))}</h2>);
      continue;
    }
    if (line.startsWith("### ")) {
      nodes.push(<h3 key={`h3-${i}`}>{renderInline(line.slice(4))}</h3>);
      continue;
    }
    if (line.startsWith("#### ")) {
      nodes.push(<h4 key={`h4-${i}`}>{renderInline(line.slice(5))}</h4>);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      nodes.push(
        <blockquote key={`quote-${i}`}>
          <p>{renderInline(line.slice(2))}</p>
        </blockquote>,
      );
      continue;
    }

    // Horizontal rule
    if (/^(\*\*\*|---|___)$/.test(line.trim())) {
      nodes.push(<hr key={`hr-${i}`} />);
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      continue;
    }

    // Regular paragraph
    nodes.push(<p key={`p-${i}`}>{renderInline(line)}</p>);
  }

  flushList("final");

  if (inCodeBlock && codeBuffer.length > 0) {
    nodes.push(
      <pre key="unclosed-code">
        <code>{codeBuffer.join("\n")}</code>
      </pre>,
    );
  }

  return nodes;
}

function renderDiffCode(lines: string[]): React.ReactNode[] {
  return lines.map((line, idx) => {
    let cls = "";
    if (line.startsWith("+")) cls = "ins";
    else if (line.startsWith("-")) cls = "del";
    else if (line.startsWith("@")) cls = "dim";

    return (
      <div key={idx} className={cls}>
        {line}
      </div>
    );
  });
}

function renderInline(text: string): React.ReactNode[] {
  // Regex for **bold**, *italic*, `code`, [link](url)
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Inline code `...`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(<code key={key++}>{codeMatch[1]}</code>);
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold **...**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(<b key={key++}>{boldMatch[1]}</b>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic *...*
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(<i key={key++}>{italicMatch[1]}</i>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Link [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <a key={key++} href={linkMatch[2]} target="_blank" rel="noreferrer">
          {linkMatch[1]}
        </a>,
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Plain text chunk up to next delimiter
    const nextDelim = remaining.search(/[`*[]/);
    if (nextDelim === -1) {
      parts.push(remaining);
      break;
    } else if (nextDelim === 0) {
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextDelim));
      remaining = remaining.slice(nextDelim);
    }
  }

  return parts;
}
