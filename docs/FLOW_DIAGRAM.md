# Request/Response Flow

## 🔄 Complete Request Lifecycle

```mermaid
sequenceDiagram
    participant C as Claude/GPT Client
    participant S as Express Server
    participant A as Adapter Layer
    participant B as Bedrock Client
    participant M as Model (GLM-5)
    
    Note over C,M: Non-Streaming Request
    
    C->>S: POST /v1/messages<br/>{model, messages, max_tokens}
    S->>S: Parse request body
    S->>A: toConverseInput(body)
    
    A->>A: Extract messages
    A->>A: Convert content blocks
    A->>A: Build inferenceConfig
    A->>A: Map tools → toolSpec
    
    A-->>S: ConverseCommandInput
    S->>B: send(ConverseCommand)
    B->>M: invoke model
    M-->>B: Response + Usage
    B-->>S: ConverseResponse
    
    S->>A: fromConverseResponse(response)
    A->>A: Extract output.message
    A->>A: Convert content blocks
    A->>A: Map stop_reason
    A->>A: Extract usage stats
    
    A-->>S: Anthropic Format Response
    S-->>C: {id, type, role, content, usage}
    
    Note over C,M: Streaming Request
    
    C->>S: POST /v1/messages<br/>{stream: true, ...}
    S->>A: toConverseInput(body)
    A-->>S: ConverseStreamCommandInput
    
    S->>B: send(ConverseStreamCommand)
    B->>M: stream invoke
    
    loop For each chunk
        M-->>B: Stream event
        B-->>S: SSE event
        
        alt contentBlockStart
            S->>C: event: content_block_start
        else contentBlockDelta
            S->>C: event: content_block_delta
        else contentBlockStop
            S->>C: event: content_block_stop
        end
    end
    
    M-->>B: messageStop event
    B-->>S: Final event
    S->>C: event: message_stop
    S->>C: Connection: close
