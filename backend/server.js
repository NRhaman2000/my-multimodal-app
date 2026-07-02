// server.js
require('dotenv').config();
const http = require('http'); 
const { WebSocketServer } = require('ws'); 
const { GoogleGenerativeAI } = require('@google/generative-ai'); 
const googleTTS = require('google-tts-api'); 

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ FATAL: GEMINI_API_KEY is missing from your local .env configuration file.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🟢 Multimodal Core Engine Active');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 5001; 

// 🚀 GLOBAL BROADCAST HELPER: Sends signals to ALL open tabs simultaneously
const broadcastToAllClients = (payload) => {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(payload));
    }
  });
};

wss.on('connection', (ws) => {
  console.log('📱 Phone client connected over high-speed multimedia bridge.');
  let currentStreamAbortController = null;
  let latestVisionFramePart = null;
  let isAiCurrentlyProcessing = false;

  ws.on('message', async (rawData) => {
    try {
      const messageString = rawData.toString();

      if (messageString === 'SIGNAL:STOP_STREAM') {
        console.log('🛑 Interruption received! Aborting AI generation pipelines...');
        if (currentStreamAbortController) currentStreamAbortController.abort = true;
        isAiCurrentlyProcessing = false;
        return;
      }

      if (messageString.startsWith('{')) {
        const packet = JSON.parse(messageString);

        // --- PIPELINE 1: LIVE CONTINUOUS VISION STREAM ---
        if (packet.type === 'VISION_FRAME') {
          latestVisionFramePart = {
            inlineData: { data: packet.data, mimeType: 'image/jpeg' }
          };

          if (!isAiCurrentlyProcessing) {
            isAiCurrentlyProcessing = true;
            currentStreamAbortController = { abort: false };
            
            const visionPromptPart = "Analyze this camera frame. Give a very short, natural, one-sentence observation about what you see. Do not repeat your previous descriptions.";
            await streamLiveGeminiAudioResponse(ws, [latestVisionFramePart, visionPromptPart], currentStreamAbortController);
            isAiCurrentlyProcessing = false;
          }
          return;
        }

        // --- PIPELINE 2: DUAL SIGHT + VOICE INTERACTION ---
        if (packet.type === 'AUDIO_CHUNK') {
          console.log(`📥 Received voice capture frame. Length: ${packet.data.length} bytes.`);
          isAiCurrentlyProcessing = true;
          currentStreamAbortController = { abort: false };

          const audioContentPart = {
            inlineData: { data: packet.data, mimeType: packet.mimeType }
          };

          const promptPayload = latestVisionFramePart 
            ? [latestVisionFramePart, audioContentPart]
            : [audioContentPart];

          await streamLiveGeminiAudioResponse(ws, promptPayload, currentStreamAbortController);
          isAiCurrentlyProcessing = false;
        }

        // --- PIPELINE 3: LIVE TEXT / VOICE CHAT HANDLER ---
        if (packet.type === 'TEXT_PROMPT') {
          console.log(`\n💬 Incoming chat query packet: "${packet.text}"`);
          try {
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const result = await model.generateContentStream([packet.text]);

            for await (const chunk of result.stream) {
              const chunkText = chunk.text();
              if (chunkText && ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'TEXT_TOKEN', text: chunkText }));
              }
            }
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'TEXT_STREAM_COMPLETE' }));
            }
          } catch (apiErr) {
            console.error('❌ Generation route crash detailed logs:', apiErr);
            
            const isRateLimited = apiErr.status === 429 || apiErr.message?.includes('429') || apiErr.message?.includes('Too Many Requests');
            
            if (isRateLimited) {
              // 🚀 FIX: Broadcast the error globally to lock down the background Video component too
              broadcastToAllClients({ type: 'SYSTEM_ERROR', code: 'RATE_LIMIT_429' });
              ws.send(JSON.stringify({ 
                type: 'TEXT_TOKEN', 
                text: 'Rate limit hit (429: Too Many Requests). Google has throttled your free tier API key. All background vision streams have been globally frozen for 60 seconds to recover.' 
              }));
            } else {
              ws.send(JSON.stringify({ type: 'TEXT_TOKEN', text: 'Error generating token response payload.' }));
            }
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'TEXT_STREAM_COMPLETE' }));
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error handling client message pipeline:', error);
      isAiCurrentlyProcessing = false;
    }
  });

  ws.on('close', () => {
    console.log('📱 Client disconnected.');
    latestVisionFramePart = null;
  });
});

// --- SERVER-SIDE AUDIO SYNTHESIS & TRANSCRIPTION LOOP ---
async function streamLiveGeminiAudioResponse(ws, promptPayload, abortController) {
  const modelTiers = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  let successfulStream = false;

  for (const modelName of modelTiers) {
    if (successfulStream || abortController.abort) break;

    try {
      console.log(`📡 Dispatching payload to: ${modelName}...`);
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: "You are a real-time conversational assistant with vision. Keep all responses short, punchy, and limited to a maximum of 2 sentences total. Never output markdown asterisks or bracket characters."
      });

      const result = await model.generateContentStream(promptPayload);
      let sentenceBuffer = '';

      for await (const chunk of result.stream) {
        if (abortController.abort || ws.readyState !== 1) return;

        const chunkText = chunk.text();
        if (chunkText) {
          process.stdout.write(chunkText);
          ws.send(JSON.stringify({ type: 'TOKEN_STREAM', text: chunkText }));
          sentenceBuffer += chunkText;

          const sentenceMatches = sentenceBuffer.match(/[^.!?]+[.!?]+/g);
          if (sentenceMatches) {
            for (const sentence of sentenceMatches) {
              const cleanSentence = sentence.trim();
              if (cleanSentence.length > 0) {
                try {
                  const base64Audio = await googleTTS.getAudioBase64(cleanSentence, {
                    lang: 'en', slow: false, host: 'https://translate.google.com',
                  });
                  ws.send(JSON.stringify({ type: 'AUDIO_PLAYBACK', audio: base64Audio }));
                } catch (ttsErr) {
                  console.error('\n⚠️ TTS Synthesis dropped for fragment:', cleanSentence);
                }
              }
              sentenceBuffer = sentenceBuffer.replace(sentence, '');
            }
          }
        }
      }

      if (sentenceBuffer.trim().length > 0 && !abortController.abort && ws.readyState === 1) {
        const remainingText = sentenceBuffer.trim();
        try {
          const base64Audio = await googleTTS.getAudioBase64(remainingText, { lang: 'en', slow: false });
          ws.send(JSON.stringify({ type: 'AUDIO_PLAYBACK', audio: base64Audio }));
        } catch (e) {}
      }

      if (ws.readyState === 1 && !abortController.abort) {
        ws.send(JSON.stringify({ type: 'STREAM_COMPLETE' }));
      }
      successfulStream = true;
    } catch (error) {
      console.log(`\n⚠️ ERROR INTERCEPTED on ${modelName}.`);
      const isServerOverloaded = error.status === 503 || error.status === 429 || error.message?.includes('503') || error.message?.includes('429');
      
      if (isServerOverloaded) {
        if (error.status === 429 || error.message?.includes('429')) {
          // 🚀 FIX: Broadcast camera freeze signal globally if vision loops cause the 429
          broadcastToAllClients({ type: 'SYSTEM_ERROR', code: 'RATE_LIMIT_429' });
        }
        if (modelName !== modelTiers[modelTiers.length - 1]) continue;
      }
      
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'STREAM_COMPLETE' }));
      break;
    }
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`📡 Network listening matrix online on port ${PORT}.`);
});