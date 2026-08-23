type Props = {
  content: string;
};

type DiffLine = {
  type: "add" | "del" | "hunk" | "meta" | "context";
  content: string;
  oldNum?: number;
  newNum?: number;
};

export function DiffPreview({ content }: Props) {
  const lines = parseUnifiedDiff(content);

  return (
    <div className="pv-diff">
      <div className="diff-table">
        {lines.map((line, idx) => (
          <div key={idx} className={`diff-row ${line.type}`}>
            <span className="diff-num old">{line.oldNum ?? ""}</span>
            <span className="diff-num new">{line.newNum ?? ""}</span>
            <span className="diff-sign">
              {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
            </span>
            <span className="diff-code">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function parseUnifiedDiff(diff: string): DiffLine[] {
  const rawLines = diff.split(/\r?\n/);
  const result: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const line of rawLines) {
    if (line.startsWith("@@")) {
      // Hunk header e.g. @@ -1,5 +1,6 @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: "hunk", content: line });
      continue;
    }

    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ")
    ) {
      result.push({ type: "meta", content: line });
      continue;
    }

    if (line.startsWith("+")) {
      result.push({
        type: "add",
        content: line.slice(1),
        newNum: newLine++,
      });
    } else if (line.startsWith("-")) {
      result.push({
        type: "del",
        content: line.slice(1),
        oldNum: oldLine++,
      });
    } else {
      result.push({
        type: "context",
        content: line.startsWith(" ") ? line.slice(1) : line,
        oldNum: oldLine++,
        newNum: newLine++,
      });
    }
  }

  return result;
}
