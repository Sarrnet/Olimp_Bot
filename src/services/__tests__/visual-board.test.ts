import { describe, it, expect } from 'vitest';
import { visualBoardService } from '../visual-board.js';

describe('VisualBoardService', () => {
    it('should generate a JPEG buffer for a paid user', async () => {
        const metrics = {
            currentHeight: 173,
            targetHeight: 187,
            potentialHeight: 184,
            completionPercentage: 94,
            isPaid: true,
            lang: 'ru'
        };
        const buffer = await visualBoardService.renderProgressBoard(metrics);
        
        expect(buffer).toBeDefined();
        expect(buffer.length).toBeGreaterThan(0);
        
        // Verify JPEG magic bytes (FF D8)
        expect(buffer[0]).toBe(0xFF);
        expect(buffer[1]).toBe(0xD8);
    });

    it('should generate a JPEG buffer for an unpaid user', async () => {
        const metrics = {
            currentHeight: 173,
            targetHeight: 187,
            potentialHeight: 184,
            completionPercentage: 94,
            isPaid: false,
            lang: 'ru'
        };
        const buffer = await visualBoardService.renderProgressBoard(metrics);
        
        expect(buffer).toBeDefined();
        expect(buffer.length).toBeGreaterThan(0);
        
        // Verify JPEG magic bytes (FF D8)
        expect(buffer[0]).toBe(0xFF);
        expect(buffer[1]).toBe(0xD8);
    });

    it('should handle missing logo gracefully', async () => {
        const metrics = {
            currentHeight: 160,
            targetHeight: 180,
            potentialHeight: 175,
            completionPercentage: 88,
            isPaid: true,
            lang: 'en'
        };
        // This should not throw even if images are missing (service has try-catch)
        const buffer = await visualBoardService.renderProgressBoard(metrics);
        expect(buffer).toBeDefined();
    });
});
