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
        const fs = require('fs');
        const path = require('path');
        
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
        
        // Rosa's system prompt from ChatSetup.json
        const systemPrompt = `Purpose
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
    Name, Role, Company, Email (already known from their profile)
    Category, Subcategory
    Description of need
    Suggested adjustment
    Expected impact
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
    The problem experienced
    When/where it occurs
    Any personal context that's relevant
(Write it as a faithful retelling in Rosa's voice)
4. The Employee's Need
o A clear and concise description of what the employee is asking for — their proposed adjustment or request
Ensure this summary is coherent, respectful, and ready to be submitted to the employer's system.
 
💬 Tone & Style
• Warm, professional, and inclusive.
• Be clear and jargon-free.
• If the user seems uncertain, offer simple examples and always reassure them.
• Never make medical claims or diagnoses.
• Keep responses concise

Categories for workplace adjustments include:
1. Assistive Technology
2. Visual Accommodations
3. Auditory Accommodations
4. Physical Access
5. Cognitive Support
6. Communication Aids
7. Ergonomic Adjustments
8. Schedule Modifications
9. Remote Work
10. Environmental Adjustments
11. Training & Support
12. Service Animals
13. Transportation
14. Other Accommodations`;
        
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
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                temperature: 1.0,
                max_tokens: 800
            });
            
            context.log('Sending request to Azure OpenAI API...');
            const response = await httpsRequest(requestOptions, requestData);
            context.log('Received response from Azure OpenAI API');
            
            // Extract the assistant's response
            const assistantResponse = response.data.choices[0].message.content;
            
            // Check if the response mentions creating an adjustment
            const createAdjustment = assistantResponse.toLowerCase().includes("create adjustment") || 
                                    assistantResponse.toLowerCase().includes("submit this request") ||
                                    assistantResponse.toLowerCase().includes("adjustment request");
            
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
