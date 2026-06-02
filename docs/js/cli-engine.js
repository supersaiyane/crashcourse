'use strict';

/**
 * CLI Playground Engine
 * Simulated terminal powered by xterm.js + command database
 */
class CLIPlayground {
  constructor(containerEl, commandsDB) {
    this.container = containerEl;
    this.db = commandsDB;
    this.history = [];
    this.historyIdx = -1;
    this.currentLine = '';
    this.scenario = null;
    this.scenarioStep = 0;
    this.prompt = (commandsDB.prompt || '$') + ' ';

    this.term = new Terminal({
      theme: {
        background: '#1a1b2e',
        foreground: '#e2e4f0',
        cursor: '#28c840',
        cursorAccent: '#1a1b2e',
        selectionBackground: 'rgba(99,102,241,0.3)',
        black: '#1a1b2e',
        red: '#ff5f57',
        green: '#28c840',
        yellow: '#febc2e',
        blue: '#7c6ff7',
        magenta: '#c678dd',
        cyan: '#64d2ff',
        white: '#e2e4f0',
        brightBlack: '#666a7e',
        brightRed: '#ff6b6b',
        brightGreen: '#50fa7b',
        brightYellow: '#f1fa8c',
        brightBlue: '#8be9fd',
        brightMagenta: '#ff79c6',
        brightCyan: '#8be9fd',
        brightWhite: '#ffffff',
      },
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
      fontSize: 14,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 1000,
      convertEol: true,
    });

    this.fitAddon = new FitAddon.FitAddon();
    this.term.loadAddon(this.fitAddon);

    this.term.open(containerEl);
    this.fitAddon.fit();

    // Welcome message
    this.writeln('\x1b[36m' + (commandsDB.welcome || 'CLI Playground ready.') + '\x1b[0m');
    this.writePrompt();

    // Handle input
    this.term.onKey(({ key, domEvent }) => {
      const ev = domEvent;

      if (ev.keyCode === 13) { // Enter
        this.term.write('\r\n');
        this.handleCommand(this.currentLine.trim());
        this.currentLine = '';
      } else if (ev.keyCode === 8) { // Backspace
        if (this.currentLine.length > 0) {
          this.currentLine = this.currentLine.slice(0, -1);
          this.term.write('\b \b');
        }
      } else if (ev.keyCode === 38) { // Up arrow
        if (this.history.length > 0 && this.historyIdx < this.history.length - 1) {
          this.historyIdx++;
          this.replaceLine(this.history[this.history.length - 1 - this.historyIdx]);
        }
      } else if (ev.keyCode === 40) { // Down arrow
        if (this.historyIdx > 0) {
          this.historyIdx--;
          this.replaceLine(this.history[this.history.length - 1 - this.historyIdx]);
        } else if (this.historyIdx === 0) {
          this.historyIdx = -1;
          this.replaceLine('');
        }
      } else if (ev.keyCode === 9) { // Tab - autocomplete
        ev.preventDefault();
        this.autocomplete();
      } else if (ev.ctrlKey && ev.keyCode === 67) { // Ctrl+C
        this.term.write('^C\r\n');
        this.currentLine = '';
        if (this.scenario) {
          this.writeln('\x1b[33mScenario paused. Type "scenario" to resume or any command to free-play.\x1b[0m');
        }
        this.writePrompt();
      } else if (ev.ctrlKey && ev.keyCode === 76) { // Ctrl+L
        this.term.clear();
        this.writePrompt();
      } else if (key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        this.currentLine += key;
        this.term.write(key);
      }
    });

    // Handle paste
    this.term.onData((data) => {
      // Only handle multi-char paste (single chars handled by onKey)
      if (data.length > 1 && !data.startsWith('\x1b')) {
        this.currentLine += data;
        this.term.write(data);
      }
    });

    // Resize handler
    window.addEventListener('resize', () => this.fitAddon.fit());
  }

  writeln(text) {
    this.term.writeln(text);
  }

  writePrompt() {
    this.term.write('\x1b[32m' + this.prompt + '\x1b[0m');
  }

  replaceLine(text) {
    // Clear current line
    const clearLen = this.currentLine.length;
    this.term.write('\b'.repeat(clearLen) + ' '.repeat(clearLen) + '\b'.repeat(clearLen));
    this.currentLine = text;
    this.term.write(text);
  }

  autocomplete() {
    if (!this.currentLine) return;
    const input = this.currentLine.toLowerCase();
    const matches = Object.keys(this.db.commands).filter(cmd =>
      cmd.toLowerCase().startsWith(input)
    );
    if (matches.length === 1) {
      this.replaceLine(matches[0]);
    } else if (matches.length > 1 && matches.length <= 8) {
      this.term.write('\r\n');
      matches.forEach(m => this.writeln('  ' + m));
      this.writePrompt();
      this.term.write(this.currentLine);
    }
  }

  handleCommand(cmd) {
    if (!cmd) {
      this.writePrompt();
      return;
    }

    this.history.push(cmd);
    this.historyIdx = -1;

    // Built-in commands
    if (cmd === 'clear') {
      this.term.clear();
      this.writePrompt();
      return;
    }

    if (cmd === 'scenario' || cmd === 'scenarios') {
      this.showScenarios();
      return;
    }

    if (cmd.startsWith('scenario ')) {
      const id = cmd.split(' ')[1];
      this.startScenario(id);
      return;
    }

    if (cmd === 'hint' && this.scenario) {
      const step = this.scenario.steps[this.scenarioStep];
      if (step) {
        this.writeln('\x1b[33m💡 ' + step.hint + '\x1b[0m');
      }
      this.writePrompt();
      return;
    }

    if (cmd === 'skip' && this.scenario) {
      this.scenarioStep++;
      this.advanceScenario();
      return;
    }

    // Check scenario step match
    if (this.scenario) {
      const step = this.scenario.steps[this.scenarioStep];
      if (step && this.matchCommand(cmd, step.expect)) {
        // Correct command — show output then advance
        this.showOutput(cmd);
        this.scenarioStep++;
        setTimeout(() => this.advanceScenario(), 300);
        return;
      }
    }

    // Look up command in database
    this.showOutput(cmd);
  }

  matchCommand(input, expected) {
    // Exact match
    if (input === expected) return true;
    // Normalized match (collapse whitespace)
    const norm = s => s.replace(/\s+/g, ' ').trim();
    if (norm(input) === norm(expected)) return true;
    // Partial match (allow missing flags)
    if (norm(input).startsWith(norm(expected).split(' ').slice(0, 3).join(' '))) return true;
    return false;
  }

  showOutput(cmd) {
    // Exact match
    if (this.db.commands[cmd]) {
      this.writeln(this.db.commands[cmd]);
      this.writePrompt();
      return;
    }

    // Fuzzy match — try removing extra spaces, flags
    const normCmd = cmd.replace(/\s+/g, ' ').trim();
    for (const [key, val] of Object.entries(this.db.commands)) {
      if (key.replace(/\s+/g, ' ').trim() === normCmd) {
        this.writeln(val);
        this.writePrompt();
        return;
      }
    }

    // Partial match — find closest
    const words = normCmd.split(' ');
    let bestMatch = null;
    let bestScore = 0;
    for (const [key, val] of Object.entries(this.db.commands)) {
      const keyWords = key.split(' ');
      let score = 0;
      for (const w of words) {
        if (keyWords.includes(w)) score++;
      }
      if (score > bestScore && score >= 2) {
        bestScore = score;
        bestMatch = { key, val };
      }
    }

    if (bestMatch && bestScore >= words.length * 0.6) {
      this.writeln(bestMatch.val);
      this.writePrompt();
      return;
    }

    // Unknown command
    this.writeln('\x1b[31mcommand not found: ' + cmd.split(' ')[0] + '\x1b[0m');
    this.writeln('\x1b[33mType "help" for available commands.\x1b[0m');
    this.writePrompt();
  }

  showScenarios() {
    if (!this.db.scenarios || this.db.scenarios.length === 0) {
      this.writeln('\x1b[33mNo scenarios available for this playground.\x1b[0m');
      this.writePrompt();
      return;
    }
    this.writeln('\x1b[36m\x1b[1mAvailable Scenarios:\x1b[0m');
    this.writeln('');
    this.db.scenarios.forEach((s, i) => {
      this.writeln(`  \x1b[32m${i + 1}.\x1b[0m ${s.title}  \x1b[90m(${s.steps.length} steps)\x1b[0m`);
      this.writeln(`     \x1b[90mStart with: scenario ${s.id}\x1b[0m`);
    });
    this.writeln('');
    this.writePrompt();
  }

  startScenario(id) {
    const idx = parseInt(id) - 1;
    const scenario = this.db.scenarios.find(s => s.id === id) ||
                     (idx >= 0 && idx < this.db.scenarios.length ? this.db.scenarios[idx] : null);
    if (!scenario) {
      this.writeln('\x1b[31mScenario not found. Type "scenario" to see available scenarios.\x1b[0m');
      this.writePrompt();
      return;
    }

    this.scenario = scenario;
    this.scenarioStep = 0;
    this.writeln('');
    this.writeln('\x1b[36m\x1b[1m━━━ Scenario: ' + scenario.title + ' ━━━\x1b[0m');
    this.writeln('\x1b[90mType "hint" for help, "skip" to skip a step, Ctrl+C to exit.\x1b[0m');
    this.writeln('');
    this.advanceScenario();
  }

  advanceScenario() {
    if (!this.scenario) return;
    if (this.scenarioStep >= this.scenario.steps.length) {
      this.writeln('');
      this.writeln('\x1b[32m\x1b[1m✓ Scenario complete: ' + this.scenario.title + '\x1b[0m');
      this.writeln('\x1b[90mType "scenario" for more labs or continue free-playing.\x1b[0m');
      this.writeln('');
      this.scenario = null;
      this.scenarioStep = 0;
      this.writePrompt();
      return;
    }

    const step = this.scenario.steps[this.scenarioStep];
    const stepNum = this.scenarioStep + 1;
    const total = this.scenario.steps.length;
    this.writeln(`\x1b[36mStep ${stepNum}/${total}:\x1b[0m ${step.instruction}`);
    this.writePrompt();
  }

  destroy() {
    this.term.dispose();
  }
}
