window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.InputManager = class InputManager {
  constructor(root) {
    this.keys = new Set();
    this.debugPressed = false;
    this.testExpPressed = false;
    this.forceRarePressed = false;
    this.choicePressed = null;
    this.switchPressed = false;
    this.ballPressed = false;
    this.partyPressed = false;
    this.menuPressed = false;
    this.setTargetWeakPressed = false;
    this.joystickVector = { x: 0, y: 0 };
    this.joystickPointer = null;
    this.root = root;
    this.knob = document.getElementById("joystickKnob");
    this.bindKeyboard();
    this.bindTouch();
  }

  bindKeyboard() {
    window.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D"].includes(event.key)) {
        event.preventDefault();
        this.keys.add(event.key.toLowerCase());
      }
      if (event.key === "z" || event.key === "Z") {
        event.preventDefault();
        this.switchPressed = true;
      }
      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        this.ballPressed = true;
      }
      if (event.key === "x" || event.key === "X") {
        event.preventDefault();
        this.partyPressed = true;
      }
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        this.menuPressed = true;
      }
      if (event.key === "F2") {
        event.preventDefault();
        this.debugPressed = true;
      }
      if (event.key === "F3") {
        event.preventDefault();
        this.testExpPressed = true;
      }
      if (event.key === "F4") {
        event.preventDefault();
        this.forceRarePressed = true;
      }
      if (event.key === "F5") {
        event.preventDefault();
        this.setTargetWeakPressed = true;
      }
      if (["1", "2", "3", "4", "5"].includes(event.key)) {
        this.choicePressed = Number(event.key) - 1;
      }
    });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.key.toLowerCase());
    });
  }

  bindTouch() {
    const zone = document.querySelector(".touch-zone");
    zone.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      zone.setPointerCapture(event.pointerId);
      this.joystickPointer = event.pointerId;
      this.updateJoystick(event);
    });

    zone.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.joystickPointer) return;
      event.preventDefault();
      this.updateJoystick(event);
    });

    const release = (event) => {
      if (event.pointerId !== this.joystickPointer) return;
      this.joystickPointer = null;
      this.joystickVector.x = 0;
      this.joystickVector.y = 0;
      this.knob.style.transform = "translate(-50%, -50%)";
    };

    zone.addEventListener("pointerup", release);
    zone.addEventListener("pointercancel", release);

    this.root.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
    this.bindActionButton("switchActionBtn", () => {
      this.switchPressed = true;
    });
    this.bindActionButton("ballActionBtn", () => {
      this.ballPressed = true;
    });
    this.bindActionButton("partyActionBtn", () => {
      this.partyPressed = true;
    });
    this.bindActionButton("menuActionBtn", () => {
      this.menuPressed = true;
    });
  }

  bindActionButton(id, action) {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      action();
    });
  }

  updateJoystick(event) {
    const stick = document.getElementById("joystick");
    const rect = stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width * 0.34;
    let x = event.clientX - cx;
    let y = event.clientY - cy;
    const len = Math.hypot(x, y);
    if (len > max) {
      x = (x / len) * max;
      y = (y / len) * max;
    }
    this.joystickVector.x = x / max;
    this.joystickVector.y = y / max;
    this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  consumeDebugToggle() {
    if (!this.debugPressed) return false;
    this.debugPressed = false;
    return true;
  }

  consumeTestExp() {
    if (!this.testExpPressed) return false;
    this.testExpPressed = false;
    return true;
  }

  consumeForceRare() {
    if (!this.forceRarePressed) return false;
    this.forceRarePressed = false;
    return true;
  }

  consumeChoiceIndex() {
    const choice = this.choicePressed;
    this.choicePressed = null;
    return choice;
  }

  consumeSwitch() {
    if (!this.switchPressed) return false;
    this.switchPressed = false;
    return true;
  }

  consumeBall() {
    if (!this.ballPressed) return false;
    this.ballPressed = false;
    return true;
  }

  consumeParty() {
    if (!this.partyPressed) return false;
    this.partyPressed = false;
    return true;
  }

  consumeSetTargetWeak() {
    if (!this.setTargetWeakPressed) return false;
    this.setTargetWeakPressed = false;
    return true;
  }

  consumeMenu() {
    if (!this.menuPressed) return false;
    this.menuPressed = false;
    return true;
  }

  movementVector() {
    let x = 0;
    let y = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    x += this.joystickVector.x;
    y += this.joystickVector.y;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }
};
