// Unit tests for OSC 133 Shell Integration logic
import assert from "node:assert/strict";

console.log("=== KIEM TRA OSC 133 PARSER (G2) ===");

class MockTerminal {
  constructor() {
    this.cursorY = 0;
    this.baseY = 0;
    this.lines = [];
  }
  get buffer() {
    return {
      active: {
        cursorY: this.cursorY,
        baseY: this.baseY,
        getLine: (y) => ({
          translateToString: () => this.lines[y] || "",
        }),
      },
    };
  }
}

class TestOsc133Tracker {
  constructor(term) {
    this.term = term;
    this.blocks = [];
    this.currentBlock = null;
    this.seq = 0;
  }

  handleOsc133(data) {
    const parts = data.split(";");
    const action = parts[0]?.trim();
    const currentY = this.term.buffer.active.cursorY + this.term.buffer.active.baseY;

    switch (action) {
      case "A": {
        const id = `cmd_${++this.seq}`;
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
        if (this.currentBlock) {
          this.currentBlock.commandLine = currentY;
          this.currentBlock.outputStartLine = currentY + 1;
        }
        break;
      }
      case "C": {
        if (this.currentBlock) {
          this.currentBlock.outputStartLine = currentY;
          this.currentBlock.startTime = Date.now();
          this.currentBlock.status = "running";
        }
        break;
      }
      case "D": {
        const exitCode = parts.length > 1 && parts[1] !== "" ? parseInt(parts[1], 10) : 0;
        if (this.currentBlock) {
          this.currentBlock.endLine = currentY;
          this.currentBlock.endTime = Date.now();
          this.currentBlock.exitCode = isNaN(exitCode) ? 0 : exitCode;
          this.currentBlock.status = exitCode === 0 ? "success" : "error";
          this.blocks.push(this.currentBlock);
          this.currentBlock = null;
        }
        break;
      }
    }
  }
}

const mockTerm = new MockTerminal();
const tracker = new TestOsc133Tracker(mockTerm);

// Simulate Command 1: Success (exit 0)
mockTerm.cursorY = 0;
tracker.handleOsc133("A"); // Prompt start
mockTerm.cursorY = 0;
mockTerm.lines[0] = "PS D:\\noname> npm run build";
tracker.handleOsc133("B"); // Command input
mockTerm.cursorY = 1;
mockTerm.lines[1] = "built in 2.4s";
tracker.handleOsc133("C"); // Output start
mockTerm.cursorY = 2;
tracker.handleOsc133("D;0"); // Finished exit 0

assert.equal(tracker.blocks.length, 1);
assert.equal(tracker.blocks[0].status, "success");
assert.equal(tracker.blocks[0].exitCode, 0);
console.log("PASS: Command 1 (Success exit 0) ->", tracker.blocks[0]);

// Simulate Command 2: Error (exit 101)
mockTerm.cursorY = 3;
tracker.handleOsc133("A");
mockTerm.cursorY = 3;
mockTerm.lines[3] = "PS D:\\noname> cargo test";
tracker.handleOsc133("B");
mockTerm.cursorY = 4;
mockTerm.lines[4] = "error[E0308]: mismatched types";
tracker.handleOsc133("C");
mockTerm.cursorY = 5;
tracker.handleOsc133("D;101");

assert.equal(tracker.blocks.length, 2);
assert.equal(tracker.blocks[1].status, "error");
assert.equal(tracker.blocks[1].exitCode, 101);
console.log("PASS: Command 2 (Error exit 101) ->", tracker.blocks[1]);

console.log("\n>>> TAT CA TEST OSC 133 DEU PASS (G2) <<<");
