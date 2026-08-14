import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const AFPLAY_PATH = '/usr/bin/afplay';
const COMPLETION_SOUND_PATH = '/System/Library/Sounds/Glass.aiff';

/**
 * Play a notification sound when chat completes.
 */
export async function playChatCompletionSound(): Promise<void> {
  if (process.platform !== 'darwin') {
    return;
  }

  try {
    await execFileAsync(AFPLAY_PATH, [COMPLETION_SOUND_PATH], { timeout: 5000 });
  } catch (error) {
    if (process.env.DEBUG_SOUND) {
      console.error('[Sound] Failed to play:', error);
    }
  }
}

/**
 * Play completion sound without blocking the response.
 */
export function playChatCompletionSoundAsync(): void {
  void playChatCompletionSound();
}
