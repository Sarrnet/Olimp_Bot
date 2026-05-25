import { createCanvas, loadImage, registerFont, CanvasRenderingContext2D } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Assets path logic
const projectRoot = path.resolve(__dirname, '../../../');
const assetsPath = path.join(projectRoot, 'height-olimp-ts/assets');
const dockerAssetsPath = path.resolve('/app/assets');

const getAssetPath = (subPath: string) => {
    const localPath = path.join(assetsPath, subPath);
    if (fs.existsSync(localPath)) return localPath;
    return path.join(dockerAssetsPath, subPath);
};

// Register fonts
try {
    const regularFont = getAssetPath('fonts/Inter-Regular.otf');
    const boldFont = getAssetPath('fonts/Inter-Bold.otf');
    
    if (fs.existsSync(regularFont)) {
        registerFont(regularFont, { family: 'Inter' });
    }
    if (fs.existsSync(boldFont)) {
        registerFont(boldFont, { family: 'Inter', weight: 'bold' });
    }
} catch (error) {
    logger.error('Error registering fonts:', error);
}

export interface HeightMetrics {
    currentHeight: number;
    targetHeight: number;
    potentialHeight: number;
    completionPercentage: number;
    isPaid?: boolean;
    lang?: string;
}

export class VisualBoardService {
    private readonly canvasWidth = 1600;
    private readonly canvasHeight = 1000;
    private readonly scale = 2;

  private cachedLogo: any = null;
  private logoLoadAttempted: boolean = false;
  
    private readonly colors = {
        lime: '#d4ff00',
        dark: '#111111',
        light: '#ffffff',
        gray: '#666666',
        subtitleGray: '#999999',
        barBg: '#f2f2f2',
        cardBg: '#fafafa',
        border: '#eeeeee',
    };

    async renderProgressBoard(metrics: HeightMetrics): Promise<Buffer> {
        const canvas = createCanvas(this.canvasWidth, this.canvasHeight);
        const ctx = canvas.getContext('2d');
        const isPaid = metrics.isPaid ?? false;
        const lang = metrics.lang || 'ru';

        // 1. Background
        ctx.fillStyle = this.colors.light;
        ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        // 2. Logo and Header
      try {
        if (!this.logoLoadAttempted && !this.cachedLogo) {
          this.logoLoadAttempted = true;
          const logoPath = getAssetPath('images/logo.jpg');
          if (fs.existsSync(logoPath)) {
            this.cachedLogo = await loadImage(logoPath)
          }
        }
        
            if (this.cachedLogo) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(60 * this.scale, 60 * this.scale, 20 * this.scale, 0, Math.PI * 2, true);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(this.cachedLogo, 40 * this.scale, 40 * this.scale, 40 * this.scale, 40 * this.scale);
                ctx.restore();
                
                ctx.strokeStyle = this.colors.dark;
                ctx.lineWidth = 2 * this.scale;
                ctx.beginPath();
                ctx.arc(60 * this.scale, 60 * this.scale, 20 * this.scale, 0, Math.PI * 2, true);
                ctx.stroke();
            }
        } catch (error) {
            logger.error('Error loading logo:', error);
        }

        ctx.fillStyle = '#1a1a1a';
        ctx.font = `900 ${22 * this.scale}px Inter`;
        ctx.fillText('OLIMP YOUR HEIGHT', 95 * this.scale, 68 * this.scale);

        // 3. Left Section: Vertical Progress Bars
        ctx.fillStyle = '#111111';
        ctx.font = `bold ${40 * this.scale}px Inter`;
        ctx.fillText('Прогресс роста', 40 * this.scale, 140 * this.scale);

        ctx.fillStyle = '#777777';
        ctx.font = `600 ${14 * this.scale}px Inter`;
        ctx.fillText('VISUAL PROGRESS BOARD', 40 * this.scale, 175 * this.scale);

        // Space below subtitle: Shifting barY down to 240
        const barX = 75 * this.scale;
        const barY = 240 * this.scale; 
        const barWidth = 70 * this.scale;
        const barHeight = 180 * this.scale; // Slightly shorter to fit everything
        const gap = 50 * this.scale;

        // "Zoomed" Logic: Baseline 140cm, Max 200cm
        // This makes 5cm difference look like ~9% of the bar height
        const baseline = 140;
        const maxScale = 200; 

        const calculateProgress = (val: number) => {
            return (val - baseline) / (maxScale - baseline);
        };

        this.renderVerticalBar(
            ctx,
            barX,
            barY,
            barWidth,
            barHeight,
            calculateProgress(metrics.currentHeight),
            `${metrics.currentHeight.toFixed(1)}`,
            'Твой рост',
            this.colors.lime,
            1.0
        );

        this.renderVerticalBar(
            ctx,
            barX + barWidth + gap,
            barY,
            barWidth,
            barHeight,
            calculateProgress(metrics.targetHeight),
            `${metrics.targetHeight.toFixed(1)}`,
            'Желаемый рост',
            this.colors.lime,
            0.35
        );

        // 4. Right Section: Info Cards
        const cardX = 420 * this.scale;
        const cardWidth = 340 * this.scale;

        this.renderInfoCard(
            ctx,
            cardX,
            150 * this.scale,
            cardWidth,
            150 * this.scale,
            lang === 'ru' ? 'Твой рост завершился на' : 'Your growth completed by',
            metrics.completionPercentage.toFixed(1),
            '%',
            true,
            isPaid,
            lang
        );

        this.renderInfoCard(
            ctx,
            cardX,
            330 * this.scale,
            cardWidth,
            150 * this.scale,
            lang === 'ru' ? 'Твой потенциальный генетический рост' : 'Your potential genetic growth',
            metrics.potentialHeight.toFixed(0),
            'см',
            false,
            isPaid,
            lang
        );

        return canvas.toBuffer('image/jpeg', { quality: 1.0, progressive: true });
    }

    private renderVerticalBar(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
        progress: number,
        value: string,
        label: string,
        color: string,
        opacity: number
    ) {
        ctx.fillStyle = this.colors.barBg;
        this.drawRoundedRect(ctx, x, y, width, height, width / 2);
        ctx.fill();

        // Clamp progress between 5% and 100% so even small heights have a visual start
        const clampedProgress = Math.max(0.05, Math.min(progress, 1.0));
        const fillHeight = height * clampedProgress;
        
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        this.drawRoundedRect(ctx, x, y + height - fillHeight, width, fillHeight, width / 2);
        ctx.fill();
        ctx.restore();

        // Value text centered
        ctx.fillStyle = '#111111';
        ctx.font = `800 ${28 * this.scale}px Inter`;
        ctx.textAlign = 'center';
        
        const mainValWidth = ctx.measureText(value).width;
        ctx.font = `600 ${14 * this.scale}px Inter`;
        const cmWidth = ctx.measureText('см').width;
        const totalWidth = mainValWidth + 8 * this.scale + cmWidth;
        
        const startX = (x + width / 2) - (totalWidth / 2);
        
        ctx.textAlign = 'left';
        ctx.font = `800 ${28 * this.scale}px Inter`;
        ctx.fillText(value, startX, y + height + 45 * this.scale);
        
        ctx.fillStyle = '#333333';
        ctx.font = `600 ${14 * this.scale}px Inter`;
        ctx.fillText('см', startX + mainValWidth + 6 * this.scale, y + height + 45 * this.scale);

        // Label text
        ctx.textAlign = 'center';
        ctx.fillStyle = '#666666';
        ctx.font = `500 ${15 * this.scale}px Inter`;
        ctx.fillText(label, x + width / 2, y + height + 70 * this.scale);
        ctx.textAlign = 'left';
    }

    private renderInfoCard(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
        label: string,
        value: string,
        unit: string,
        hasProgressBar: boolean,
        isPaid: boolean = false,
        lang: string = 'ru'
    ) {
        ctx.save();
        ctx.fillStyle = this.colors.cardBg;
        ctx.shadowColor = 'rgba(0,0,0,0.04)';
        ctx.shadowBlur = 40 * this.scale;
        ctx.shadowOffsetY = 15 * this.scale;
        this.drawRoundedRect(ctx, x, y, width, height, 25 * this.scale);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = this.colors.border;
        ctx.lineWidth = 1 * this.scale;
        ctx.stroke();

        // Label wrapping
        ctx.fillStyle = '#444444';
        ctx.font = `600 ${17 * this.scale}px Inter`;
        const labelLines = this.getLines(ctx, label, width - 60 * this.scale);
        labelLines.forEach((line, index) => {
            ctx.fillText(line, x + 30 * this.scale, y + 45 * this.scale + (index * 24 * this.scale));
        });

        // Dynamic Y for value
        const valueY = y + 110 * this.scale + (labelLines.length > 1 ? 25 * this.scale : 0);
        
        if (isPaid) {
            ctx.fillStyle = '#111111';
            ctx.font = `900 ${64 * this.scale}px Inter`;
            ctx.fillText(value, x + 30 * this.scale, valueY);

            const valueWidth = ctx.measureText(value).width;
            ctx.fillStyle = unit === '%' ? '#b8d900' : '#111111';
            ctx.font = `800 ${26 * this.scale}px Inter`;
            ctx.fillText(unit, x + 35 * this.scale + valueWidth, valueY);

            // Optional Mini Progress Bar
            if (hasProgressBar) {
                const pbWidth = 280 * this.scale; // Wider bar
                const pbHeight = 8 * this.scale;
                const pbX = x + 30 * this.scale; // Align with text
                const pbY = valueY + 20 * this.scale; // Move BELOW the number

                ctx.fillStyle = '#e5e5e5';
                this.drawRoundedRect(ctx, pbX, pbY, pbWidth, pbHeight, 4 * this.scale);
                ctx.fill();

                ctx.fillStyle = this.colors.lime;
                const progress = Math.min(parseFloat(value) / 100, 1.0);
                this.drawRoundedRect(ctx, pbX, pbY, pbWidth * progress, pbHeight, 4 * this.scale);
                ctx.fill();
            }
        } else {
            // Draw Lock Icon and "Locked" Text
            const lockSize = 35 * this.scale;
            const lockX = x + 30 * this.scale;
            const lockY = valueY - 45 * this.scale;
            
            this.drawLockIcon(ctx, lockX, lockY, lockSize);
            
            ctx.fillStyle = '#888888';
            ctx.font = `italic 600 ${18 * this.scale}px Inter`;
            const lockedText = lang === 'ru' ? 'Доступно в полной версии' : 'Available in full version';
            ctx.fillText(lockedText, lockX + lockSize + 15 * this.scale, lockY + lockSize / 1.5);

            if (hasProgressBar) {
                const pbWidth = 280 * this.scale;
                const pbHeight = 8 * this.scale;
                const pbX = x + 30 * this.scale;
                const pbY = valueY + 20 * this.scale;

                ctx.fillStyle = '#e5e5e5';
                this.drawRoundedRect(ctx, pbX, pbY, pbWidth, pbHeight, 4 * this.scale);
                ctx.fill();
            }
        }
    }

    private drawLockIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
        ctx.save();
        ctx.strokeStyle = '#666666';
        ctx.fillStyle = '#666666';
        ctx.lineWidth = 2.5 * this.scale;

        // Lock body
        const bodyHeight = size * 0.6;
        const bodyWidth = size;
        const bodyY = y + size * 0.4;
        this.drawRoundedRect(ctx, x, bodyY, bodyWidth, bodyHeight, 4 * this.scale);
        ctx.stroke();
        
        // Lock shackle (the arch)
        ctx.beginPath();
        const centerX = x + size / 2;
        const radius = size * 0.25;
        ctx.arc(centerX, bodyY, radius, Math.PI, 0);
        ctx.stroke();

        // Keyhole
        ctx.beginPath();
        ctx.arc(centerX, bodyY + bodyHeight / 2, 3 * this.scale, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }

    private getLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + ' ' + word).width;
            if (width < maxWidth) {
                currentLine += ' ' + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        return lines;
    }

    private drawRoundedRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number
    ) {
        if (width <= 0) return;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
}

export const visualBoardService = new VisualBoardService();
