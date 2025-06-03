// Azure Function for Voice Conversation WebSocket Endpoint
// File: voiceconversation/index.js

const { SpeechConfig, AudioConfig, SpeechRecognizer, ResultReason } = require('microsoft-cognitiveservices-speech-sdk');
const { WebSocketServer } = require('ws');

module.exports = async function (context, req) {
    // Check if this is a WebSocket request
    if (req.headers['sec-websocket-key']) {
        context.log('WebSocket connection request received');
        
        // Create WebSocket server
        const wss = new WebSocketServer({ noServer: true });
        
        // Handle WebSocket connection
        wss.on('connection', (ws) => {
            context.log('WebSocket connection established');
            
            // Client configuration
            let clientConfig = {
                language: 'en-US',
                voiceName: 'en-US-JennyNeural',
                interruptible: true
            };
            
            // Conversation state
            let conversationState = 'idle';
            let currentRecognizer = null;
            let messages = [];
            
            // Handle messages from client
            ws.on('message', async (message) => {
                try {
                    // Check if message is binary (audio data) or text (JSON)
                    if (message instanceof Buffer) {
                        // Process audio data if in listening state
                        if (conversationState === 'listening') {
                            processAudioData(message);
                        }
                    } else {
                        // Process JSON message
                        const data = JSON.parse(message.toString());
                        
                        switch (data.type) {
                            case 'config':
                                // Update client configuration
                                clientConfig = {
                                    ...clientConfig,
                                    ...data
                                };
                                context.log('Updated client configuration:', clientConfig);
                                break;
                                
                            case 'text':
                                // Process text message directly
                                conversationState = 'processing';
                                sendToClient(ws, { type: 'state', state: conversationState });
                                
                                // Add to message history
                                messages.push({ role: 'user', content: data.text });
                                
                                // Process with OpenAI
                                const response = await processWithOpenAI(messages);
                                
                                // Add to message history
                                messages.push({ role: 'assistant', content: response });
                                
                                // Convert to speech
                                const audioUrl = await textToSpeech(response, clientConfig.voiceName);
                                
                                // Send response to client
                                conversationState = 'speaking';
                                sendToClient(ws, { 
                                    type: 'response', 
                                    text: response,
                                    audioUrl: audioUrl,
                                    state: conversationState
                                });
                                break;
                                
                            case 'interrupt':
                                // Handle interruption
                                if (conversationState === 'speaking') {
                                    conversationState = 'listening';
                                    sendToClient(ws, { type: 'state', state: conversationState });
                                }
                                break;
                                
                            default:
                                context.log('Unknown message type:', data.type);
                        }
                    }
                } catch (error) {
                    context.log.error('Error processing message:', error);
                    sendToClient(ws, { type: 'error', message: 'Error processing message' });
                }
            });
            
            // Handle WebSocket close
            ws.on('close', () => {
                context.log('WebSocket connection closed');
                if (currentRecognizer) {
                    currentRecognizer.close();
                }
            });
            
            // Process audio data with Azure Speech API
            async function processAudioData(audioData) {
                if (!currentRecognizer) {
                    // Initialize speech recognizer
                    const speechConfig = SpeechConfig.fromSubscription(
                        process.env.SPEECH_KEY,
                        process.env.SPEECH_REGION
                    );
                    speechConfig.speechRecognitionLanguage = clientConfig.language;
                    
                    // Create recognizer with push audio stream
                    const audioConfig = AudioConfig.fromStreamInput(createPushStream());
                    currentRecognizer = new SpeechRecognizer(speechConfig, audioConfig);
                    
                    // Handle recognition results
                    currentRecognizer.recognized = (s, e) => {
                        if (e.result.reason === ResultReason.RecognizedSpeech) {
                            const transcript = e.result.text;
                            context.log('RECOGNIZED:', transcript);
                            
                            // Send transcript to client
                            sendToClient(ws, { 
                                type: 'transcript', 
                                text: transcript,
                                isFinal: true
                            });
                            
                            // Process recognized speech
                            processRecognizedSpeech(transcript);
                        }
                    };
                    
                    // Start continuous recognition
                    await currentRecognizer.startContinuousRecognitionAsync();
                }
                
                // Push audio data to recognizer
                pushAudioData(audioData);
            }
            
            // Process recognized speech
            async function processRecognizedSpeech(transcript) {
                if (transcript.trim()) {
                    // Update state
                    conversationState = 'processing';
                    sendToClient(ws, { type: 'state', state: conversationState });
                    
                    // Add to message history
                    messages.push({ role: 'user', content: transcript });
                    
                    // Process with OpenAI
                    const response = await processWithOpenAI(messages);
                    
                    // Add to message history
                    messages.push({ role: 'assistant', content: response });
                    
                    // Convert to speech
                    const audioUrl = await textToSpeech(response, clientConfig.voiceName);
                    
                    // Send response to client
                    conversationState = 'speaking';
                    sendToClient(ws, { 
                        type: 'response', 
                        text: response,
                        audioUrl: audioUrl,
                        state: conversationState
                    });
                }
            }
            
            // Initialize conversation
            conversationState = 'listening';
            sendToClient(ws, { type: 'state', state: conversationState });
            
            // Add system message to history
            messages.push({
                role: 'system',
                content: `Purpose
You are Rosa, an AI assistant embedded in the AXS Passport platform. Your goal is to help employees identify and articulate workplace challenges, suggest reasonable adjustments, and submit an official Adjustment Request to their employer's HR system.
 
Context Awareness
• You are speaking to an employee who may be unfamiliar with workplace adjustments.
• They may feel unsure, overwhelmed, or confused about what they need.
• You should guide them gently, empathetically, and clearly.
 
Step-by-Step Flow
1. Welcome & Purpose
o Greet the user and explain that you're here to help them create a workplace adjustment request.
o Let them know they're in control and can stop anytime.
2. Discover the Challenge
o Ask open-ended questions like:
"What's been challenging at work lately?"
"Is there anything that could make your day-to-day easier or more comfortable?"
3. Understand Context
o Ask about where/when the issue occurs:
"When do you notice this the most?"
"Does it relate to your environment, equipment, communication, or something else?"
4. Classify the Need
o Suggest a Subcategory (e.g., Assistive Tech → Screen Reader).
o Allow them to change the selection or say they're unsure.
o If unsure, offer 2–3 suggestions they can choose from.
5. Suggest a Solution
o Offer a possible adjustment with a reason:
"A noise-cancelling headset could help by reducing distractions—does that sound helpful?"
6. Capture Impact
o Ask:
"How do you think this adjustment will help you?"
"What difference would it make to your work or wellbeing?"
7. Confirm Details
o Recap the user's:
◦ Name, Role, Company, Email (already known from their profile)
◦ Category, Subcategory
◦ Description of need
◦ Suggested adjustment
◦ Expected impact
8. Submit
o Confirm with the user:
"Ready to submit this request? You'll receive updates from our Ally once it's reviewed."
Final Output Requirements
At the end of the conversation, you must extract and present four elements in a clear summary:
1. Category (e.g., Communication)
2. Subcategory (e.g., Alternative Formats)
o If not yet implemented in system, leave as "Pending"
3. Contextual Description
o A single paragraph that explains:
◦ The problem experienced
◦ When/where it occurs
◦ Any personal context that's relevant
(Write it as a faithful retelling in Rosa's voice)
4. The Employee's Need
o A clear and concise description of what the employee is asking for — their proposed adjustment or request
Ensure this summary is coherent, respectful, and ready to be submitted to the employer's system.
 
🔒 Tone & Style
• Warm, professional, and inclusive.
• Be clear and jargon-free.
• If the user seems uncertain, offer simple examples and always reassure them.
• Never make medical claims or diagnoses.
• Keep responses concise`
            });
        });
        
        // Upgrade HTTP request to WebSocket
        context.bindings.res = {
            status: 101,
            headers: {
                'Upgrade': 'websocket',
                'Connection': 'Upgrade',
                'Sec-WebSocket-Accept': computeAccept(req.headers['sec-websocket-key'])
            },
            body: ''
        };
    } else {
        // Handle regular HTTP request
        context.res = {
            status: 200,
            body: "This endpoint requires a WebSocket connection."
        };
    }
};

// Helper functions

// Send message to client
function sendToClient(ws, data) {
    if (ws.readyState === 1) { // OPEN
        ws.send(JSON.stringify(data));
    }
}

// Process messages with OpenAI
async function processWithOpenAI(messages) {
    // Azure OpenAI configuration
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_KEY;
    const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT;
    const apiVersion = '2023-12-01-preview';
    
    // Prepare request
    const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;
    
    const requestData = {
        messages: messages,
        temperature: 1.0,
        top_p: 1.0,
        max_tokens: 800
    };
    
    // Send request to Azure OpenAI
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey
        },
        body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
}

// Convert text to speech using Azure Speech Service
async function textToSpeech(text, voiceName) {
    // In a real implementation, this would use Azure Speech Service to generate audio
    // For now, we'll return a placeholder URL
    return `https://axs-passport-agent.azurewebsites.net/api/audio/${encodeURIComponent(voiceName)}`;
}

// Create push audio stream for speech recognition
function createPushStream() {
    // Implementation would use Azure Speech SDK's PushAudioInputStream
    // This is a placeholder for the actual implementation
    return null;
}

// Push audio data to the stream
function pushAudioData(audioData) {
    // Implementation would push data to the PushAudioInputStream
    // This is a placeholder for the actual implementation
}

// Compute WebSocket accept header
function computeAccept(key) {
    const crypto = require('crypto');
    const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    const sha1 = crypto.createHash('sha1');
    sha1.update(key + magic);
    return sha1.digest('base64');
}
