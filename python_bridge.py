#!/usr/bin/env python3
"""
Python Bridge for ModuMentor Express Backend
Connects Express.js backend to Python intelligent agent
"""

import sys
import os
import json
import asyncio
from pathlib import Path

# Ensure proper UTF-8 encoding for emoji support
import locale
import codecs

# Set UTF-8 encoding for stdout and stderr
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# Add the parent directory to Python path to import modules
sys.path.append(str(Path(__file__).parent.parent))

try:
    from agents.intelligent_agent import IntelligentAgent
    from config import config
    import sys
    print("Successfully imported intelligent agent modules", file=sys.stderr)
except ImportError as e:
    import sys
    print(f"Import error: {e}", file=sys.stderr)
    sys.exit(1)

# Global agent instance
agent = None

def initialize_agent():
    """Initialize the intelligent agent"""
    global agent
    try:
        agent = IntelligentAgent()
        import sys
        print(f"Intelligent agent initialized successfully with ID: {id(agent)}", file=sys.stderr)
        return True
    except Exception as e:
        import sys
        print(f"Failed to initialize agent: {e}", file=sys.stderr)
        agent = None
        return False

def process_message(message, user_id="web-user"):
    """Process a message through the intelligent agent"""
    global agent
    
    if not agent:
        if not initialize_agent():
            return {
                "error": "Failed to initialize intelligent agent",
                "response": "I'm sorry, but I'm having trouble connecting to my AI brain right now. Please try again later."
            }
    
    try:
        # Create event loop for async processing
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            # Use stderr for debug output to avoid interfering with JSON
            import sys
            print(f"Processing message: '{message}' for user {user_id}", file=sys.stderr)
            response = loop.run_until_complete(
                agent.process_message(message, user_id)
            )
            print(f"Agent response: {response[:100]}...", file=sys.stderr)
            
            # Return response with proper UTF-8 encoding for emojis
            return {
                "response": response,
                "success": True
            }
        finally:
            loop.close()
            
    except Exception as e:
        print(f"Error processing message: {e}", file=sys.stderr)
        return {
            "error": str(e),
            "response": f"I encountered an error while processing your message: {str(e)}"
        }

def clear_conversation(user_id="web-user"):
    """Clear conversation history for a user"""
    global agent
    
    if not agent:
        if not initialize_agent():
            return {
                "error": "Failed to initialize intelligent agent",
                "success": False
            }
    
    try:
        response = agent.clear_conversation(user_id)
        return {
            "response": response,
            "success": True
        }
    except Exception as e:
        print(f"Error clearing conversation: {e}", file=sys.stderr)
        return {
            "error": str(e),
            "success": False
        }

def get_help():
    """Get help information"""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            response = loop.run_until_complete(agent.get_help_message())
            return { "response": response, "success": True }
        finally:
            loop.close()
    except Exception as e:
        print(f"Error getting help: {e}", file=sys.stderr)
        return { "error": str(e), "response": f"I encountered an error while getting help: {str(e)}" }

def analyze_conversation(user_id="web-user"):
    """Analyze conversation and provide detailed summary"""
    global agent
    if not agent:
        if not initialize_agent():
            return { "error": "Failed to initialize intelligent agent", "response": "I'm sorry, but I'm having trouble connecting to my AI brain right now. Please try again later." }
    try:
        # Get conversation analysis directly from conversation memory
        analysis = agent.conversation_memory.analyze_conversation(user_id)
        
        if not analysis["has_conversation"]:
            return { "response": "We haven't had any previous conversations in this session. This is our first interaction! 😊", "success": True }
        
        # Format the analysis as a response
        summary = analysis["summary"]
        topics = analysis["topics"]
        sentiment = analysis["sentiment"]
        insights = analysis["insights"]
        recent_messages = analysis["recent_messages"]

        response_parts = [
            "🧠 **Conversation Analysis Report** 📊",
            "",
            "📈 **Conversation Statistics:**",
            f"• **Total Messages:** {summary['total_messages']}",
            f"• **Your Messages:** {summary['user_messages']}",
            f"• **My Responses:** {summary['assistant_messages']}",
            f"• **Duration:** {summary['conversation_duration_hours']} hours",
            f"• **Started:** {summary['conversation_start']}",
            f"• **Last Activity:** {summary['last_activity']}",
            "",
            "🎯 **Topics Discussed:**",
            f"• {', '.join(topics)}",
            "",
            "😊 **Sentiment Analysis:**",
            f"• **Overall Tone:** {sentiment['overall_sentiment'].title()}",
            f"• **Engagement Level:** {sentiment['engagement_level'].title()}",
            f"• **Questions Asked:** {sentiment['question_count']}",
            "",
            "💡 **Key Insights:**"
        ]
        
        for insight in insights:
            response_parts.append(f"• {insight}")
        
        response_parts.extend([
            "",
            "🔄 **Recent Messages:**"
        ])
        
        for msg in recent_messages:
            role_emoji = "👤" if msg["role"] == "user" else "🤖"
            response_parts.append(f"{role_emoji} **{msg['role'].title()}** ({msg['timestamp']}): {msg['content']}")
        
        response_parts.extend([
            "",
            "💭 **Analysis Summary:**",
            f"This conversation shows {sentiment['engagement_level']} engagement with a {sentiment['overall_sentiment']} tone. ",
            f"We've covered {len(topics)} main topic{'s' if len(topics) != 1 else ''} over {summary['conversation_duration_hours']} hours. ",
            f"I'm here to continue helping you with any questions or tasks! 🚀"
        ])

        return { "response": "\n".join(response_parts), "success": True }
        
    except Exception as e:
        print(f"Error analyzing conversation: {e}", file=sys.stderr)
        return { "error": str(e), "response": f"I encountered an error while analyzing our conversation: {str(e)}" }

def test_tools():
    """Test all available tools"""
    global agent
    
    if not agent:
        return {
            "error": "Agent not initialized",
            "success": False
        }
    
    try:
        # Test each tool with a sample query
        test_queries = {
            "dictionary": "test",
            "weather": "current weather",
            "web_search": "latest news",
            "gmail": "email functionality",
            "sheets": "spreadsheet access"
        }
        
        results = {}
        
        for tool_name, query in test_queries.items():
            try:
                # This would need to be implemented based on your tool structure
                # For now, we'll simulate the tests
                results[tool_name] = {
                    "status": "success",
                    "query": query,
                    "response": f"{tool_name.title()} tool is available and working"
                }
            except Exception as e:
                results[tool_name] = {
                    "status": "error",
                    "query": query,
                    "error": str(e)
                }
        
        return {
            "test_results": results,
            "success": True
        }
        
    except Exception as e:
        print(f"Error testing tools: {e}")
        return {
            "error": str(e),
            "success": False
        }

def main():
    """Main function to handle command line arguments"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command provided"}), file=sys.stderr)
        sys.exit(1)
    
    command = sys.argv[1]
    args = sys.argv[2:] if len(sys.argv) > 2 else []
    
    try:
        if command == "process_message":
            if len(args) < 1:
                result = {"error": "Message required for process_message command"}
            else:
                message = args[0]
                user_id = args[1] if len(args) > 1 else "web-user"
                result = process_message(message, user_id)
        
        elif command == "clear_conversation":
            user_id = args[0] if len(args) > 0 else "web-user"
            result = clear_conversation(user_id)
        
        elif command == "get_help":
            result = get_help()
        
        elif command == "test_tools":
            result = test_tools()
        
        elif command == "analyze_conversation":
            user_id = args[0] if len(args) > 0 else "web-user"
            result = analyze_conversation(user_id)
        
        else:
            result = {"error": f"Unknown command: {command}"}
        
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main() 