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
        // Get OpenAI configuration from environment variables
        const apiKey = process.env.OPENAI_API_KEY;
        const endpoint = process.env.OPENAI_API_ENDPOINT;
        const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_0aScZhXyrWQFzG3juluU2sAn";
        
        if (!apiKey || !endpoint) {
            throw new Error("OpenAI API configuration is missing");
        }
        
        context.log(`Using endpoint: ${endpoint}`);
        context.log(`Using assistant ID: ${assistantId}`);
        
        try {
            // Step 1: Create a thread
            const threadsUrl = `${endpoint}/openai/threads?api-version=2023-12-01-preview`;
            context.log(`Creating thread at: ${threadsUrl}`);
            
            const threadResponse = await fetch(threadsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                },
                body: JSON.stringify({})
            });
            
            if (!threadResponse.ok) {
                const errorText = await threadResponse.text();
                throw new Error(`Failed to create thread: ${threadResponse.status}: ${errorText}`);
            }
            
            const threadData = await threadResponse.json();
            const threadId = threadData.id;
            context.log(`Thread created with ID: ${threadId}`);
            
            // Step 2: Add a message to the thread
            const messagesUrl = `${endpoint}/openai/threads/${threadId}/messages?api-version=2023-12-01-preview`;
            context.log(`Adding message to thread at: ${messagesUrl}`);
            
            const messageResponse = await fetch(messagesUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                },
                body: JSON.stringify({
                    role: "user",
                    content: userMessage
                })
            });
            
            if (!messageResponse.ok) {
                const errorText = await messageResponse.text();
                throw new Error(`Failed to add message: ${messageResponse.status}: ${errorText}`);
            }
            
            context.log(`Message added to thread successfully`);
            
            // Step 3: Run the assistant on the thread
            const runUrl = `${endpoint}/openai/threads/${threadId}/runs?api-version=2023-12-01-preview`;
            context.log(`Running assistant on thread at: ${runUrl}`);
            
            const runResponse = await fetch(runUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                },
                body: JSON.stringify({
                    assistant_id: assistantId
                })
            });
            
            if (!runResponse.ok) {
                const errorText = await runResponse.text();
                throw new Error(`Failed to run assistant: ${runResponse.status}: ${errorText}`);
            }
            
            const runData = await runResponse.json();
            const runId = runData.id;
            context.log(`Run created with ID: ${runId}`);
            
            // Step 4: Poll for run completion
            let runStatus = "queued";
            let attempts = 0;
            const maxAttempts = 30; // Maximum number of polling attempts
            const pollInterval = 1000; // Polling interval in milliseconds
            
            const getRunStatusUrl = `${endpoint}/openai/threads/${threadId}/runs/${runId}?api-version=2023-12-01-preview`;
            
            while (runStatus !== "completed" && runStatus !== "failed" && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                
                const runStatusResponse = await fetch(getRunStatusUrl, {
                    method: 'GET',
                    headers: {
                        'api-key': apiKey
                    }
                });
                
                if (!runStatusResponse.ok) {
                    const errorText = await runStatusResponse.text();
                    throw new Error(`Failed to get run status: ${runStatusResponse.status}: ${errorText}`);
                }
                
                const runStatusData = await runStatusResponse.json();
                runStatus = runStatusData.status;
                context.log(`Run status: ${runStatus}, attempt: ${attempts + 1}`);
                attempts++;
            }
            
            if (runStatus !== "completed") {
                throw new Error(`Run did not complete successfully. Final status: ${runStatus}`);
            }
            
            // Step 5: Get messages from the thread
            const getMessagesUrl = `${endpoint}/openai/threads/${threadId}/messages?api-version=2023-12-01-preview`;
            context.log(`Getting messages from thread at: ${getMessagesUrl}`);
            
            const getMessagesResponse = await fetch(getMessagesUrl, {
                method: 'GET',
                headers: {
                    'api-key': apiKey
                }
            });
            
            if (!getMessagesResponse.ok) {
                const errorText = await getMessagesResponse.text();
                throw new Error(`Failed to get messages: ${getMessagesResponse.status}: ${errorText}`);
            }
            
            const messagesData = await getMessagesResponse.json();
            
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
            context.log.error(`Azure AI Assistant API error: ${apiError.message}`);
            context.res = {
                status: 200,
                body: {
                    response: `I received your message: "${userMessage}". This is a placeholder response while we troubleshoot the Azure AI Assistant integration.`,
                    createAdjustment: false,
                    error: apiError.message,
                    config: {
                        endpoint: endpoint,
                        assistantId: assistantId
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
