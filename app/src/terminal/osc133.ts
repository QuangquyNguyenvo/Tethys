import type { Terminal } from "@xterm/xterm";

export type CommandBlock = {
  id: string;
  promptLine: number;
  commandLine: number;
  outputStartLine: number;
  endLine?: number;
  exitCode?: number;
  startTime?: number;
  endTime?: number;
  status: "running" | "success" | "error";
  commandText?: string;
};

export class Osc133Tracker {
  private blocks: CommandBlock[] = [];
  private currentBlock: Partial<CommandBlock> | null = null;
  private seq = 0;
  private term: Terminal;
  private onBlocksChange?: (blocks: CommandBlock[]) => void;
  /** Báo lệnh đang chạy (hoặc `null` khi shell rảnh) — thanh tiêu đề dùng để hiện tên app. */
  private onRunningChange?: (cmd: string | null) => void;

  constructor(
    term: Terminal,
    onBlocksChange?: (blocks: CommandBlock[]) => void,
    onRunningChange?: (cmd: string | null) => void,
  ) {
    this.term = term;
    this.onBlocksChange = onBlocksChange;
    this.onRunningChange = onRunningChange;
    this.register();
  }

  private nextId() {
    return `cmd_${++this.seq}`;
  }

  private register() {
    // Đăng ký OSC 133 handler với parser của xterm.js
    this.term.parser.registerOscHandler(133, (data: string) => {
      this.handleOsc133(data);
      return true;
    });
  }

  public handleOsc133(data: string) {
    const parts = data.split(";");
    const action = parts[0]?.trim();
    const currentY = this.term.buffer.active.cursorY + this.term.buffer.active.baseY;

    switch (action) {
      case "A": {
        // Prompt Start
        if (this.currentBlock && this.currentBlock.status === "running") {
          this.currentBlock.endLine = currentY;
          this.currentBlock.endTime = Date.now();
        }

        const id = this.nextId();
        this.currentBlock = {
          id,
          promptLine: currentY,
          commandLine: currentY,
          outputStartLine: currentY,
          status: "running",
          startTime: Date.now(),
        };
        break;
      }

      case "B": {
        // Command Start (Prompt ended)
        if (this.currentBlock) {
          this.currentBlock.commandLine = currentY;
          this.currentBlock.outputStartLine = currentY + 1;
        }
        break;
      }

      case "C": {
        // Command Executed / Output Start
        if (this.currentBlock) {
          this.currentBlock.outputStartLine = currentY;
          this.currentBlock.startTime = Date.now();
          this.currentBlock.status = "running";

          // Shell gửi kèm dòng lệnh ở dạng `133;C;<lệnh>` (dấu `;` trong lệnh vẫn giữ nguyên).
          // Không có payload thì đọc lại từ buffer — nhưng lúc đó dòng còn dính cả prompt.
          const payload = parts.length > 1 ? parts.slice(1).join(";").trim() : "";
          if (payload) {
            this.currentBlock.commandText = payload;
          } else {
            const line = this.term.buffer.active.getLine(this.currentBlock.commandLine ?? currentY);
            if (line) {
              this.currentBlock.commandText = line.translateToString(true).trim();
            }
          }
          this.onRunningChange?.(this.currentBlock.commandText ?? null);
        }
        break;
      }

      case "D": {
        // Command Finished (D[;exit_code])
        const exitCode = parts.length > 1 && parts[1] !== "" ? parseInt(parts[1], 10) : 0;
        if (this.currentBlock) {
          this.currentBlock.endLine = currentY;
          this.currentBlock.endTime = Date.now();
          this.currentBlock.exitCode = isNaN(exitCode) ? 0 : exitCode;
          this.currentBlock.status = exitCode === 0 ? "success" : "error";

          const completed = this.currentBlock as CommandBlock;
          this.blocks.push(completed);
          this.currentBlock = null;

          this.onRunningChange?.(null);
          if (this.onBlocksChange) {
            this.onBlocksChange([...this.blocks]);
          }
        }
        break;
      }
    }
  }

  public getBlocks(): CommandBlock[] {
    return [...this.blocks];
  }

  public jumpToPreviousCommand(): void {
    const currentY = this.term.buffer.active.cursorY + this.term.buffer.active.baseY;
    // Tìm block có promptLine < currentY
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      if (b.promptLine < currentY) {
        this.term.scrollToLine(b.promptLine);
        return;
      }
    }
    if (this.blocks.length > 0) {
      this.term.scrollToLine(this.blocks[0].promptLine);
    }
  }

  public jumpToNextCommand(): void {
    const currentY = this.term.buffer.active.cursorY + this.term.buffer.active.baseY;
    // Tìm block có promptLine > currentY
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (b.promptLine > currentY) {
        this.term.scrollToLine(b.promptLine);
        return;
      }
    }
    this.term.scrollToBottom();
  }

  public getBlockOutput(block: CommandBlock): string {
    const end = block.endLine ?? this.term.buffer.active.baseY + this.term.buffer.active.cursorY;
    const lines: string[] = [];
    for (let y = block.outputStartLine; y < end; y++) {
      const line = this.term.buffer.active.getLine(y);
      if (line) {
        lines.push(line.translateToString(true));
      }
    }
    return lines.join("\n").trim();
  }

  public getBlockCommand(block: CommandBlock): string {
    if (block.commandText) return block.commandText;
    const line = this.term.buffer.active.getLine(block.commandLine);
    return line ? line.translateToString(true).trim() : "";
  }
}
