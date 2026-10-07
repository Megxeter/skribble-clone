import { Stroke, StrokePoint } from '@skribbl/shared';

export class DrawingState {
  private strokes: Stroke[] = [];
  private currentStroke: Stroke | null = null;

  public startStroke(x: number, y: number, color: string, size: number): Stroke {
    const point: StrokePoint = { x, y };
    this.currentStroke = {
      type: 'stroke',
      points: [point],
      color,
      size
    };
    this.strokes.push(this.currentStroke);
    return this.currentStroke;
  }

  public addFill(x: number, y: number, color: string): Stroke {
    const fillStroke: Stroke = {
      type: 'fill',
      x,
      y,
      color,
      points: [],
      size: 0
    };
    this.strokes.push(fillStroke);
    return fillStroke;
  }

  public addPoint(x: number, y: number): void {
    if (this.currentStroke) {
      this.currentStroke.points.push({ x, y });
    }
  }

  public endStroke(): void {
    this.currentStroke = null;
  }

  public undo(): Stroke[] {
    this.strokes.pop();
    this.currentStroke = null;
    return this.getStrokes();
  }

  public clear(): void {
    this.strokes = [];
    this.currentStroke = null;
  }

  public getStrokes(): Stroke[] {
    return [...this.strokes];
  }
}
