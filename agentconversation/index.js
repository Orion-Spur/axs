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
        // Import built-in https module
        const https = require('https');
        
        // Get Azure OpenAI configuration from environment variables
        const apiKey = process.env.AZURE_AI_API_KEY || process.env.OPENAI_API_KEY;
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT || "https://axs-passport-agent-resource.cognitiveservices.azure.com/";
        const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";
        const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2023-12-01-preview";
        
        if (!apiKey || !endpoint) {
            throw new Error("Azure OpenAI API configuration is missing");
        }
        
        context.log(`Using endpoint: ${endpoint}`);
        context.log(`Using deployment: ${deploymentName}`);
        
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
            
            // Construct the Azure OpenAI API URL for chat completions
            const apiPath = `/openai/deployments/${deploymentName}/chat/completions`;
            const apiUrl = `${apiPath}?api-version=${apiVersion}`;
            
            context.log(`Making request to: ${apiUrl}`);
            
            const requestOptions = {
                hostname: endpointUrl.hostname,
                path: apiUrl,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                }
            };
            
            const requestData = JSON.stringify({
                messages: [
                    { role: "system", content: "You are the AXS Passport AI Agent, designed to help with workplace adjustments." },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.7,
                max_tokens: 800
            });
            
            context.log('Sending request to Azure OpenAI API...');
            const response = await httpsRequest(requestOptions, requestData);
            context.log('Received response from Azure OpenAI API');
            
            // Extract the assistant's response
            const assistantResponse = response.data.choices[0].message.content;
            
            // Check if the response mentions creating an adjustment
            const createAdjustment = assistantResponse.toLowerCase().includes("create adjustment");
            
            context.res = {
                status: 200,
                body: {
                    response: assistantResponse,
                    createAdjustment: createAdjustment
                }
            };
        } catch (apiError) {
            // Log the API error but still return a successful response with placeholder
            context.log.error(`Azure OpenAI API error: ${apiError.message}`);
            context.res = {
                status: 200,
                body: {
                    response: `I received your message: "${userMessage}". This is a placeholder response while we troubleshoot the Azure OpenAI integration.`,
                    createAdjustment: false,
                    error: apiError.message,
                    config: {
                        endpoint: endpoint,
                        deploymentName: deploymentName
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
