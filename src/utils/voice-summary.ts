import { execFile } from 'child_process';
import { ElevenLabsClient, play } from '@elevenlabs/elevenlabs-js';

function speakWithMacOS(text: string): void {
  if (process.platform !== 'darwin') return;
  execFile('/usr/bin/say', [text], (error) => {
    if (error && process.env.DEBUG_VOICE) {
      console.error('[Voice] Failed to speak:', error.message);
    }
  });
}

// Initialize ElevenLabs client
let elevenlabs: ElevenLabsClient | null = null;
let elevenLabsFailureReported = false;
if (process.env.ELEVENLABS_API_KEY) {
  elevenlabs = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
  });
  if (process.env.DEBUG_VOICE) {
    console.log('[ElevenLabs] Client initialized with API key');
  }
} else {
  console.log('[ElevenLabs] No API key found, will use fallback');
}

// Voice ID for text-to-speech (Rachel voice)
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';

function useMacOSFallback(text: string): void {
  elevenlabs = null;
  if (!elevenLabsFailureReported) {
    console.warn('[ElevenLabs] TTS unavailable; using macOS voice fallback.');
    elevenLabsFailureReported = true;
  }
  speakWithMacOS(text);
}

/**
 * Speak the first 1-2 sentences of the actual response as the summary using ElevenLabs
 */
export async function speakSummary(responseText: string, toolCalls: number = 0): Promise<void> {
  const summary = extractFirstSentences(responseText.trim(), toolCalls);

  // Fallback to macOS 'say' command if ElevenLabs API key not configured
  if (!elevenlabs) {
    if (process.env.DEBUG_VOICE) {
      console.log('[ElevenLabs] Using fallback (macOS say command)');
    }
    speakWithMacOS(summary);
    return;
  }

  try {
    if (process.env.DEBUG_VOICE) {
      console.log('[ElevenLabs] Converting text to speech:', summary.substring(0, 50) + '...');
    }
    const audio = await elevenlabs.textToSpeech.convert(VOICE_ID, {
      text: summary,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
    });

    await play(audio);
    if (process.env.DEBUG_VOICE) {
      console.log('[ElevenLabs] Audio played successfully');
    }
  } catch (error) {
    if (process.env.DEBUG_VOICE) {
      console.error('[ElevenLabs] Failed to speak:', error);
    }
    useMacOSFallback(summary);
  }
}

/** Pull the first 1-2 sentences, capped at ~200 chars */
function extractFirstSentences(text: string, toolCalls: number): string {
  // Strip markdown: code fences, headers, bold/italic
  const plain = text
    .replace(/```[\s\S]*?```/g, toolCalls > 0 ? 'code block' : '')
    .replace(/`[^`]+`/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();

  // Split on sentence boundaries
  const sentences = plain.match(/[^.!?]+[.!?]+/g) ?? [plain];
  let summary = sentences.slice(0, 2).join(' ').trim();

  // Cap at 200 chars so it doesn't ramble
  if (summary.length > 200) {
    summary = summary.slice(0, 200).replace(/\s+\S*$/, '') + '...';
  }

  return summary || 'Done';
}

/**
 * Speak completion message with word count using ElevenLabs
 */
export async function speakCompletion(responseText: string): Promise<void> {
  const words = responseText.split(/\s+/).filter(w => w).length;

  let message = 'All done';

  if (words > 100) {
    message = `Complete. Generated ${words} words`;
  } else if (words > 50) {
    message = 'Task finished';
  } else if (words > 20) {
    message = 'Done';
  }

  if (!elevenlabs) {
    speakWithMacOS(message);
    return;
  }

  try {
    const audio = await elevenlabs.textToSpeech.convert(VOICE_ID, {
      text: message,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
    });

    await play(audio);
  } catch (error) {
    if (process.env.DEBUG_VOICE) {
      console.error('[ElevenLabs] Failed to speak:', error);
    }
    useMacOSFallback(message);
  }
}
