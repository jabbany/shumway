/**
 * Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
module Shumway.Tools.Profiler {

  import clamp = NumberUtilities.clamp;

  export enum FlameChartOverviewMode {
    OVERLAY,
    STACK,
    UNION
  }

  enum DragTarget {
    NONE,
    WINDOW,
    HANDLE_LEFT,
    HANDLE_RIGHT,
    HANDLE_BOTH
  }

  interface DragInfo {
    windowStartInitial: number;
    windowEndInitial: number;
    target: DragTarget;
  }

  interface Selection {
    left: number;
    right: number;
  }

  export class FlameChartOverview extends FlameChartBase implements MouseControllerTarget {

    private _overviewCanvasDirty: boolean;
    private _overviewCanvas: HTMLCanvasElement;
    private _overviewContext: CanvasRenderingContext2D;

    private _selection: Selection;
    private _dragInfo: DragInfo;
    private _mode: FlameChartOverviewMode;

    constructor(controller: Controller, mode: FlameChartOverviewMode = FlameChartOverviewMode.STACK) {
      this._mode = mode;
      this._overviewCanvasDirty = true;
      this._overviewCanvas = document.createElement("canvas");
      this._overviewContext = this._overviewCanvas.getContext("2d");
      super(controller);
    }

    set mode(value: FlameChartOverviewMode) {
      this._mode = value;
      this._draw();
    }

    _resetCanvas() {
      super._resetCanvas();
      this._overviewCanvas.width = this._canvas.width;
      this._overviewCanvas.height = this._canvas.height;
      this._overviewCanvasDirty = true;
    }

    _draw() {
      var context = this._context;
      var ratio = window.devicePixelRatio;
      var width = this._width;
      var height = this._height;

      context.save();
      context.scale(ratio, ratio);
      context.fillStyle = "rgba(17, 19, 21, 1)";
      context.fillRect(0, 0, width, height);
      context.restore();

      if (this._initialized) {
        if (this._overviewCanvasDirty) {
          this._drawChart();
          this._overviewCanvasDirty = false;
        }
        context.drawImage(this._overviewCanvas, 0, 0);
        this._drawSelection();
      }
    }

    private _drawSelection() {
      var context = this._context;
      var height = this._height;
      var ratio = window.devicePixelRatio;
      var left = this._selection ? this._selection.left : this._toPixels(this._windowStart);
      var right = this._selection ? this._selection.right : this._toPixels(this._windowEnd);

      context.save();
      context.scale(ratio, ratio);

      // Draw fills
      if (this._selection) {
        context.fillStyle = "rgba(245, 247, 250, 0.15)";
        context.fillRect(left, 1, right - left, height - 1);
        context.fillStyle = "rgba(133, 0, 0, 1)";
        context.fillRect(left + 0.5, 0, right - left - 1, 4);
        context.fillRect(left + 0.5, height - 4, right - left - 1, 4);
      } else {
        context.fillStyle = "rgba(17, 19, 21, 0.4)";
        context.fillRect(0, 1, left, height - 1);
        context.fillRect(right, 1, this._width, height - 1);
      }

      // Draw border lines
      context.beginPath();
      context.moveTo(left, 0);
      context.lineTo(left, height);
      context.moveTo(right, 0);
      context.lineTo(right, height);
      context.lineWidth = 0.5;
      context.strokeStyle = "rgba(245, 247, 250, 1)";
      context.stroke();

      // Draw info labels
      var start = this._selection ? this._toTime(this._selection.left) : this._windowStart;
      var end = this._selection ? this._toTime(this._selection.right) : this._windowEnd;
      var time = Math.abs(end - start);
      context.fillStyle = "rgba(255, 255, 255, 0.5)";
      context.font = '8px sans-serif';
      context.textBaseline = "alphabetic";
      context.textAlign = "end";
      // Selection Range in MS
      context.fillText(time.toFixed(2), Math.min(left, right) - 4, 10);
      // Selection Range in Frames
      context.fillText((time / 60).toFixed(2), Math.min(left, right) - 4, 20);
      context.restore();
    }

    private _drawChart() {
      var ratio = window.devicePixelRatio;
      var width = this._width;
      var height = this._height;
      var profile = this._controller.profile;
      var samplesPerPixel = 4;
      var samplesCount = width * samplesPerPixel;
      var sampleTimeInterval = profile.totalTime / samplesCount;
      var contextOverview = this._overviewContext;

      contextOverview.save();
      contextOverview.translate(0, ratio * height);
      var yScale = -ratio * height / (profile.maxDepth - 1);
      contextOverview.scale(ratio / samplesPerPixel, yScale);
      contextOverview.clearRect(0, 0, samplesCount, profile.maxDepth - 1);
      if (this._mode == FlameChartOverviewMode.STACK) {
        contextOverview.scale(1, 1 / profile.bufferCount);
      }
      var bufferCount = profile.bufferCount;
      for (var i = 0; i < bufferCount; i++) {
        var buffer = profile.getBufferAt(i);
        var deepestFrame = null;
        var depth = 0;
        contextOverview.beginPath();
        contextOverview.moveTo(0, 0);
        for (var x = 0; x < samplesCount; x++) {
          var time = profile.startTime + x * sampleTimeInterval;
          if (!deepestFrame) {
            deepestFrame = buffer.snapshot.query(time);
          } else {
            deepestFrame = deepestFrame.queryNext(time);
          }
          depth = deepestFrame ? deepestFrame.getDepth() - 1 : 0;
          contextOverview.lineTo(x, depth);
        }
        contextOverview.lineTo(x, 0);
        contextOverview.fillStyle = "#46afe3";
        contextOverview.fill();
        if (this._mode == FlameChartOverviewMode.STACK) {
          contextOverview.translate(0, -height * ratio / yScale);
        }
      }

      contextOverview.restore();
    }

    private _toPixelsRelative(time: number): number {
      return time * this._width / (this._rangeEnd - this._rangeStart);
    }

    private _toPixels(time: number): number {
      return this._toPixelsRelative(time - this._rangeStart);
    }

    private _toTimeRelative(px: number): number {
      return px * (this._rangeEnd - this._rangeStart) / this._width;
    }

    private _toTime(px: number): number {
      return this._toTimeRelative(px) + this._rangeStart;
    }

    private _almostEq(a: number, b: number, precision: number = 10): boolean {
      var pow10 = Math.pow(10, precision);
      return Math.abs(a - b) < (1 / pow10);
    }

    private _windowEqRange(): boolean {
      return (this._almostEq(this._windowStart, this._rangeStart) && this._almostEq(this._windowEnd, this._rangeEnd));
    }

    private _getDragTargetUnderCursor(x: number, y:number): DragTarget {
      if (y >= 0 && y < this._height) {
        var left = this._toPixels(this._windowStart);
        var right = this._toPixels(this._windowEnd);
        var radius = 2 + (FlameChartBase.DRAGHANDLE_WIDTH) / 2;
        var leftHandle = (x >= left - radius && x <= left + radius);
        var rightHandle = (x >= right - radius && x <= right + radius);
        if (leftHandle && rightHandle) {
          return DragTarget.HANDLE_BOTH;
        } else if (leftHandle) {
          return DragTarget.HANDLE_LEFT;
        } else if (rightHandle) {
          return DragTarget.HANDLE_RIGHT;
        } else if (!this._windowEqRange() && x > left + radius && x < right - radius) {
          return DragTarget.WINDOW;
        }
      }
      return DragTarget.NONE;
    }

    onMouseDown(x: number, y: number) {
      var dragTarget = this._getDragTargetUnderCursor(x, y);
      if (dragTarget === DragTarget.NONE) {
        this._selection = { left: x, right: x };
        this._draw();
      } else {
        if (dragTarget === DragTarget.WINDOW) {
          this._mouseController.updateCursor(MouseCursor.GRABBING);
        }
        this._dragInfo = <DragInfo>{
          windowStartInitial: this._windowStart,
          windowEndInitial: this._windowEnd,
          target: dragTarget
        };
      }
    }

    onMouseMove(x: number, y: number) {
      var cursor = MouseCursor.DEFAULT;
      var dragTarget = this._getDragTargetUnderCursor(x, y);
      if (dragTarget !== DragTarget.NONE && !this._selection) {
        cursor = (dragTarget === DragTarget.WINDOW) ? MouseCursor.GRAB : MouseCursor.EW_RESIZE;
      }
      this._mouseController.updateCursor(cursor);
    }

    onMouseOver(x: number, y: number) {
      this.onMouseMove(x, y);
    }

    onMouseOut() {
      this._mouseController.updateCursor(MouseCursor.DEFAULT);
    }

    onMouseWheel(x: number, y: number, delta: number) {
      var time = this._toTime(x);
      var windowStart = this._windowStart;
      var windowEnd = this._windowEnd;
      var windowLen = windowEnd - windowStart;
      /*
       * Find maximum allowed delta
       * (windowEnd + (windowEnd - time) * delta) - (windowStart + (windowStart - time) * delta) = LEN
       * (windowEnd - windowStart) + ((windowEnd - time) * delta) - ((windowStart - time) * delta) = LEN
       * (windowEnd - windowStart) + ((windowEnd - time) - (windowStart - time)) * delta = LEN
       * (windowEnd - windowStart) + (windowEnd - windowStart) * delta = LEN
       * (windowEnd - windowStart) * delta = LEN - (windowEnd - windowStart)
       * delta = (LEN - (windowEnd - windowStart)) / (windowEnd - windowStart)
       */
      var maxDelta = Math.max((FlameChartBase.MIN_WINDOW_LEN - windowLen) / windowLen, delta);
      var start = windowStart + (windowStart - time) * maxDelta;
      var end = windowEnd + (windowEnd - time) * maxDelta;
      this._controller.setWindow(start, end);
    }

    onDrag(startX: number, startY: number, currentX: number, currentY: number, deltaX: number, deltaY: number) {
      if (this._selection) {
        this._selection = { left: startX, right: clamp(currentX, 0, this._width - 1) };
        this._draw();
      } else {
        var dragInfo = this._dragInfo;
        if (dragInfo.target === DragTarget.HANDLE_BOTH) {
          if (deltaX !== 0) {
            dragInfo.target = (deltaX < 0) ? DragTarget.HANDLE_LEFT : DragTarget.HANDLE_RIGHT;
          } else {
            return;
          }
        }
        var windowStart = this._windowStart;
        var windowEnd = this._windowEnd;
        var delta = this._toTimeRelative(deltaX);
        switch (dragInfo.target) {
          case DragTarget.WINDOW:
            windowStart = dragInfo.windowStartInitial + delta;
            windowEnd = dragInfo.windowEndInitial + delta;
            break;
          case DragTarget.HANDLE_LEFT:
            windowStart = clamp(dragInfo.windowStartInitial + delta, this._rangeStart, windowEnd - 20);
            break;
          case DragTarget.HANDLE_RIGHT:
            windowEnd = clamp(dragInfo.windowEndInitial + delta, windowStart + 20, this._rangeEnd);
            break;
          default:
            return;
        }
        this._controller.setWindow(windowStart, windowEnd);
      }
    }

    onDragEnd(startX: number, startY: number, currentX: number, currentY: number, deltaX: number, deltaY: number) {
      if (this._selection) {
        this._selection = null;
        this._controller.setWindow(this._toTime(startX), this._toTime(currentX));
      }
      this._dragInfo = null;
      this.onMouseMove(currentX, currentY);
    }

    onClick(x: number, y: number) {
      this._dragInfo = null;
      this._selection = null;
      if (!this._windowEqRange()) {
        var dragTarget = this._getDragTargetUnderCursor(x, y);
        if (dragTarget === DragTarget.NONE) {
          this._controller.moveWindowTo(this._toTime(x));
        }
        this.onMouseMove(x, y);
      }
      this._draw();
    }

    onHoverStart(x: number, y: number) {}
    onHoverEnd() {}

  }
}


/*
    private _onClick(event: MouseEvent) {
    if (this._ignoreClick) {
    this._ignoreClick = false;
    return;
    }
    if (event.clientY < this._overviewHeight) {
    var window = this._windowRight - this._windowLeft;
    var windowLeft = this._range.startTime + event.clientX * this._pixelsToOverviewTime - window / 2;
    var windowRight = this._range.startTime + event.clientX * this._pixelsToOverviewTime + window / 2;
    this._updateWindow(windowLeft, windowRight);
    this._updateCursor(event);
    }
    }

    private _onMouseUp(event: MouseEvent) {
    if (this._drag) {
    this._drag = null;
    this._ignoreClick = true;
    }
    this._updateCursor(event);
    }

    private _onMouseDown(event: MouseEvent) {
    if (event.clientY < this._overviewHeight) {
    if (this._getCursorPosition(event) == 0) {
    this._drag = {
    overview: true,
    clientX: event.clientX,
    windowLeft: this._windowLeft,
    windowRight: this._windowRight
    };
    }
    } else {
    this._drag = {
    overview: false,
    clientX: event.clientX,
    windowLeft: this._windowLeft,
    windowRight: this._windowRight
    };
    }
    this._updateCursor(event);
    }

    private _onMouseMove(event: MouseEvent) {
    if (this._drag) {
    var offset: number;
    var mult: number;
    if (this._drag.overview) {
    offset = event.clientX - this._drag.clientX;
    mult = this._pixelsToOverviewTime;
    } else {
    offset = -event.clientX + this._drag.clientX;
    mult = this._pixelsToTime;
    }
    var windowLeft = this._drag.windowLeft + offset * mult;
    var windowRight = this._drag.windowRight + offset * mult;
    this._updateWindow(windowLeft, windowRight);
    }
    this._updateCursor(event);
    }

    private _onMouseWheel(event: MouseEvent) {
    event.stopPropagation();
    if (this._drag === null) {
    var range = this._range;
    var delta = clamp(event.detail ? event.detail / 8 : -event.wheelDeltaY / 120, -1, 1);
    var zoom = Math.pow(1.2, delta) - 1;
    var cursorTime = (event.clientY > this._overviewHeight || this._getCursorPosition(event) !== 0)
    ? this._windowLeft + event.clientX * this._pixelsToTime
    : range.startTime + event.clientX * this._pixelsToOverviewTime;
    var windowLeft = this._windowLeft + (this._windowLeft - cursorTime) * zoom;
    var windowRight = this._windowRight + (this._windowRight - cursorTime) * zoom;
    this._updateWindow(windowLeft, windowRight);
    this._updateCursor(event);
    }
    }

    private _clampWindow() {
    var range = this._range;
    var windowSize = this._windowRight - this._windowLeft;
    if (windowSize < this._minTime) {
    windowSize = this._minTime;
    var center = this._windowLeft + (this._windowRight - this._windowLeft) / 2;
    this._windowLeft = center - this._minTime / 2;
    this._windowRight = center + this._minTime / 2;
    }
    if (this._windowLeft < range.startTime) {
    this._windowLeft = range.startTime;
    this._windowRight = clamp(this._windowLeft + windowSize, range.startTime, range.endTime);
    } else if (this._windowRight > range.endTime) {
    this._windowRight = range.endTime;
    this._windowLeft = clamp(this._windowRight - windowSize, range.startTime, range.endTime);
    }
    }

    private _updateUnits() {
    this._timeToPixels = this._width / (this._windowRight - this._windowLeft);
    this._pixelsToTime = (this._windowRight - this._windowLeft) / this._width;
    this._pixelsToOverviewTime = (this._profile.endTime - this._profile.startTime) / this._width;
    }

    private _updateWindow(left: number, right: number) {
    if (this._windowLeft !== left || this._windowRight !== right) {
    this._windowLeft = left;
    this._windowRight = right;
    this._clampWindow();
    this._updateUnits();
    this._draw();
    }
    }
*/
