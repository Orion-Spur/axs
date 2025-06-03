module.exports = async function (context, req) {
    context.log('Agent conversation function processing request...');

    // Get user message from request body
    const userMessage = req.body && req.body.message;
    
    if (!userMessage) {
        context.res = {
            status: 400,
            body: "Please pass a message in the request body"
        };
        return;
    }

    try {
        // Import built-in https and querystring modules
        const https = require('https');
        const querystring = require('querystring');
        
        // Get Azure AI Foundry configuration from environment variables
        const apiKey = process.env.AZURE_AI_API_KEY || process.env.OPENAI_API_KEY;
        const endpoint = process.env.AZURE_AI_ENDPOINT || "https://axs-passport-agent.services.ai.azure.com/api";
        const assistantId = process.env.AZURE_AI_ASSISTANT_ID || "asst_0aScZhXyrWQFzG3juluU2sAn";
        const threadId = process.env.AZURE_AI_THREAD_ID || "thread_jtL5xhJcvYy8tjMhu0ZI6A8";
        
        if (!apiKey || !endpoint) {
            throw new Error("Azure AI Foundry API configuration is missing");
        }
        
        context.log(`Using endpoint: ${endpoint}`);
        context.log(`Using assistant ID: ${assistantId}`);
        context.log(`Using thread ID: ${threadId}`);
        
        // Create a promise-based https request function
        const httpsRequest = (options, postData) => {
            return new Promise((resolve, reject) => {
                const req = https.request(options, (res) => {
                    let data = '';
                    
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            try {
                                const parsedData = data ? JSON.parse(data) : {};
                                resolve({
                                    status: res.statusCode,
                                    statusText: res.statusMessage,
                                    data: parsedData
                                });
                            } catch (e) {
                                reject(new Error(`Failed to parse response: ${e.message}, data: ${data}`));
                            }
                        } else {
                            reject(new Error(`Request failed with status ${res.statusCode}: ${data}`));
                        }
                    });
                }).on('error', (err) => {
                    reject(err);
                });
                
                if (postData) {
                    req.write(postData);
                }
                
                req.end();
            });
        };
        
        try {
            // Parse the endpoint URL
            const endpointUrl = new URL(endpoint);
            
            // Add a message to the thread
            const messagesPath = `/agents/${assistantId}/threads/${threadId}/messages`;
            context.log(`Adding message to thread at: ${messagesPath}`);
            
            const messageOptions = {
                hostname: endpointUrl.hostname,
                path: messagesPath,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                }
            };
            
            const messageData = JSON.stringify({
                role: "user",
                content: userMessage
            });
            
            const messageResponse = await httpsRequest(messageOptions, messageData);
            context.log(`Message added to thread successfully: ${messageResponse.status}`);
            
            // Run the assistant on the thread
            const runPath = `/agents/${assistantId}/threads/${threadId}/runs`;
            context.log(`Running assistant on thread at: ${runPath}`);
            
            const runOptions = {
                hostname: endpointUrl.hostname,
                path: runPath,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                }
            };
            
            const runData = JSON.stringify({
                agent_id: assistantId
            });
            
            const runResponse = await httpsRequest(runOptions, runData);
            const runId = runResponse.data.id;
            context.log(`Run created with ID: ${runId}`);
            
            // Poll for run completion
            let runStatus = "queued";
            let attempts = 0;
            const maxAttempts = 30; // Maximum number of polling attempts
            const pollInterval = 1000; // Polling interval in milliseconds
            
            const getRunStatusPath = `/agents/${assistantId}/threads/${threadId}/runs/${runId}`;
            
            while (runStatus !== "completed" && runStatus !== "failed" && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                
                const runStatusOptions = {
                    hostname: endpointUrl.hostname,
                    path: getRunStatusPath,
                    method: 'GET',
                    headers: {
                        'api-key': apiKey
                    }
                };
                
                const runStatusResponse = await httpsRequest(runStatusOptions);
                runStatus = runStatusResponse.data.status;
                context.log(`Run status: ${runStatus}, attempt: ${attempts + 1}`);
                attempts++;
            }
            
            if (runStatus !== "completed") {
                throw new Error(`Run did not complete successfully. Final status: ${runStatus}`);
            }
            
            // Get messages from the thread
            const getMessagesPath = `/agents/${assistantId}/threads/${threadId}/messages`;
            context.log(`Getting messages from thread at: ${getMessagesPath}`);
            
            const getMessagesOptions = {
                hostname: endpointUrl.hostname,
                path: getMessagesPath,
                method: 'GET',
                headers: {
                    'api-key': apiKey
                }
            };
            
            const getMessagesResponse = await httpsRequest(getMessagesOptions);
            const messagesData = getMessagesResponse.data;
            
            // Find the assistant's response (should be the most recent assistant message)
            const assistantMessages = messagesData.data.filter(msg => msg.role === "assistant");
            
            if (assistantMessages.length === 0) {
                throw new Error("No assistant messages found in the thread");
            }
            
            // Get the most recent assistant message
            const latestAssistantMessage = assistantMessages[0];
            
            // Extract the text content from the message
            let agentResponse = "";
            if (latestAssistantMessage.content && latestAssistantMessage.content.length > 0) {
                for (const contentItem of latestAssistantMessage.content) {
                    if (contentItem.type === "text") {
                        agentResponse += contentItem.text.value;
                    }
                }
            }
            
            // Check if the response mentions creating an adjustment
            const createAdjustment = agentResponse.toLowerCase().includes("create adjustment");
            
            context.res = {
                status: 200,
                body: {
                    response: agentResponse,
                    createAdjustment: createAdjustment
                }
            };
        } catch (apiError) {
            // Log the API error but still return a successful response with placeholder
            context.log.error(`Azure AI Foundry API error: ${apiError.message}`);
            context.res = {
                status: 200,
                body: {
                    response: `I received your message: "${userMessage}". This is a placeholder response while we troubleshoot the Azure AI Foundry integration.`,
                    createAdjustment: false,
                    error: apiError.message,
                    config: {
                        endpoint: endpoint,
                        assistantId: assistantId,
                        threadId: threadId
                    }
                }
            };
        }
    } catch (error) {
        context.log.error(`Error: ${error.message}`);
        context.res = {
            status: 500,
            body: {
                error: "An error occurred while processing your request",
                details: error.message
            }
        };
    }
};
