# MCP 1.0.0 - Architecture Documentation

## System Overview

**Name**: Anthropi-compatible Bedrock Proxy  
**Version**: 1.0.0  
**Purpose**: Bridge between Claude Code/GPT tools and AWS Bedrock models  
**Core Function**: Request/response translation between Anthropic/OpenAI APIs and AWS Bedrock

---

## 🏗️ Architecture Diagram

```mermaid
graph TB
    Client[Claude Code / OpenAI Client]
    
    subgraph "MCP 1.0.0 Proxy Layer"
        Server[Express Server<br/>:3000]
        Router[Request Router]
        
        subgraph "Endpoints"
            EP1[/v1/messages<br/>Anthropic API]
            EP2[/v1/chat/completions<br/>OpenAI API]
            EP3[/v1/completions<br/>Legacy API]
            EP4[/v1/models<br/>Model Registry]
        end
        
        subgraph "Translation Layer"
            A1[Anthropic Adapter]
            A2[OpenAI Adapter]
            A3[Response Formatter]
        end
    end
    
    subgraph "AWS Bedrock Runtime"
        BC[Bedrock Client<br/>SDK v3]
        CC[ConverseCommand]
        CSC[ConverseStreamCommand]
    end
    
    subgraph "Models"
        M1[zai.glm-5<br/>Current]
        M2[DeepSeek v3.2<br/>Alternative]
        M3[Amazon Nova Pro<br/>Fallback]
    end
    
    Client -->|Anthropic Format| Server
    Client -->|OpenAI Format| Server
    Server --> Router
    Router --> EP1
    Router --> EP2
    Router --> EP3
    Router --> EP4
    
    EP1 --> A1
    EP2 --> A2
    EP3 --> A2
    
    A1 --> BC
    A2 --> BC
    
    BC --> CC
    BC --> CSC
    
    CC --> M1
    CSC --> M1
    CC --> M2
    CSC --> M2
    CC --> M3
    CSC --> M3
    
    style Server fill:#4A90E2,color:#fff
    style BC fill:#FF9900,color:#fff
    style M1 fill:#7B68EE,color:#fff
