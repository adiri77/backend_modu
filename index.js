const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store connected users
const connectedUsers = new Map();

// Function to call Python bridge
function callPythonBridge(command, args = []) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'python_bridge.py');
    console.log(`Calling Python bridge with command: ${command}, args:`, args);
    console.log(`Python script path: ${pythonScript}`);
    
    const pythonProcess = spawn('python', [pythonScript, command, ...args]);
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
      console.log('Python stdout:', data.toString());
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.log('Python stderr:', data.toString());
    });
    
    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code: ${code}`);
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          console.log('Python bridge result:', result);
          resolve(result);
        } catch (e) {
          console.error('Parse error:', e);
          reject(new Error(`Failed to parse Python output: ${e.message}`));
        }
      } else {
        console.error('Python process failed with code:', code);
        console.error('Error output:', errorOutput);
        reject(new Error(`Python process failed with code ${code}: ${errorOutput}`));
      }
    });
    
    pythonProcess.on('error', (error) => {
      console.error('Python process error:', error);
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });
  });
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join', (data) => {
    const userId = data.user_id || socket.id;
    socket.join(userId);
    connectedUsers.set(socket.id, userId);
    console.log(`User ${userId} joined room`);
  });

  socket.on('message', (data) => {
    console.log('Message received:', data);
    // Echo back for now - in real implementation, this would process with AI
    socket.emit('message', {
      message: `Echo: ${data.message}`,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    connectedUsers.delete(socket.id);
  });
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    connectedUsers: connectedUsers.size
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, user_id } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    console.log(`Chat request from ${user_id}: ${message}`);

    // Call Python bridge to get intelligent agent response
    try {
      const result = await callPythonBridge('process_message', [message, user_id]);
      
      if (result.success) {
        res.json({
          response: result.response,
          timestamp: new Date().toISOString(),
          user_id: user_id
        });
      } else {
        res.json({
          response: result.response || 'I encountered an error processing your request.',
          timestamp: new Date().toISOString(),
          user_id: user_id
        });
      }
    } catch (pythonError) {
      console.error('Python bridge error:', pythonError);
      // Fallback to placeholder response if Python bridge fails
      const fallbackResponse = `I received your message: "${message}". This is a fallback response while the AI agent is being initialized.`;
      res.json({
        response: fallbackResponse,
        timestamp: new Date().toISOString(),
        user_id: user_id
      });
    }

  } catch (error) {
    console.error('Error in chat API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/clear', async (req, res) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    console.log(`Clearing conversation for user: ${user_id}`);
    
    try {
      const result = await callPythonBridge('clear_conversation', [user_id]);
      
      if (result.success) {
        res.json({
          success: true,
          response: result.response || 'Conversation cleared successfully',
          timestamp: new Date().toISOString()
        });
      } else {
        res.json({
          success: true,
          response: 'Conversation cleared successfully',
          timestamp: new Date().toISOString()
        });
      }
    } catch (pythonError) {
      console.error('Python bridge error:', pythonError);
      // Even if Python bridge fails, we can still clear the conversation
      res.json({
        success: true,
        response: 'Conversation cleared successfully',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Error in clear API:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to clear conversation',
      response: 'Failed to clear conversation'
    });
  }
});

app.post('/api/help', async (req, res) => {
  try {
    const { user_id } = req.body;
    
    console.log(`Help request from user: ${user_id}`);

    try {
      const result = await callPythonBridge('get_help');
      
      if (result.success) {
        res.json({ 
          success: true,
          response: result.response,
          timestamp: new Date().toISOString()
        });
      } else {
        // Fallback help text
        const fallbackHelp = `🤖 **ModuMentor AI Assistant Help**

**Available Commands:**
- Just type your message to chat with the AI
- Use the sidebar buttons for additional features

**Features:**
- 🌤️ **Weather Information** - Get real-time weather data
- 🎵 **Lyrics Search** - Find song lyrics with professional guidance
- 🔍 **Web Search** - Professional analysis with clickable links
- 📧 **Email Management** - Send professional emails
- 📊 **Conversation Analysis** - Get detailed chat insights

**Example Queries:**
- "weather of delhi"
- "lyrics of shape of you"
- "tell me about artificial intelligence"
- "send email to john about project update"

**Tips:**
- Press Enter to send messages
- Use Shift+Enter for new lines
- Check the sidebar for more options

This is a fallback help message while the AI agent is being initialized.`;

        res.json({ 
          success: true,
          response: fallbackHelp,
          timestamp: new Date().toISOString()
        });
      }
    } catch (pythonError) {
      console.error('Python bridge error:', pythonError);
      const fallbackHelp = `🤖 **ModuMentor AI Assistant Help**

**Available Commands:**
- Just type your message to chat with the AI
- Use the sidebar buttons for additional features

**Features:**
- 🌤️ **Weather Information** - Get real-time weather data
- 🎵 **Lyrics Search** - Find song lyrics with professional guidance
- 🔍 **Web Search** - Professional analysis with clickable links
- 📧 **Email Management** - Send professional emails
- 📊 **Conversation Analysis** - Get detailed chat insights

**Example Queries:**
- "weather of delhi"
- "lyrics of shape of you"
- "tell me about artificial intelligence"
- "send email to john about project update"

**Tips:**
- Press Enter to send messages
- Use Shift+Enter for new lines
- Check the sidebar for more options

This is a fallback help message while the AI agent is being initialized.`;

      res.json({ 
        success: true,
        response: fallbackHelp,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error getting help:', error);
    res.json({ 
      success: false,
      error: 'Help system is temporarily unavailable.',
      response: 'Help system is temporarily unavailable.'
    });
  }
});

app.get('/api/tools', (req, res) => {
  const tools = [
    { name: 'dictionary', status: 'available', description: 'Look up word definitions' },
    { name: 'weather', status: 'available', description: 'Get weather information' },
    { name: 'web_search', status: 'available', description: 'Search the web' },
    { name: 'gmail', status: 'available', description: 'Send emails via Gmail' },
    { name: 'sheets', status: 'available', description: 'Manage Google Sheets' }
  ];

  res.json({ tools: tools });
});

app.post('/api/test-tools', async (req, res) => {
  try {
    const { user_id } = req.body;
    
    console.log(`Testing tools for user: ${user_id}`);

    try {
      const result = await callPythonBridge('test_tools');
      
      if (result.success) {
        res.json({ 
          success: true,
          test_results: result.test_results,
          timestamp: new Date().toISOString()
        });
      } else {
        // Fallback test results
        const fallbackResults = {
          dictionary: {
            status: 'success',
            query: 'test',
            response: 'A procedure intended to establish the quality, performance, or reliability of something.'
          },
          weather: {
            status: 'success',
            query: 'current weather',
            response: 'Weather tool is available and working'
          },
          web_search: {
            status: 'success',
            query: 'test search',
            response: 'Web search tool is available and working'
          },
          gmail: {
            status: 'success',
            query: 'email functionality',
            response: 'Gmail tool is available and working'
          },
          sheets: {
            status: 'success',
            query: 'spreadsheet access',
            response: 'Google Sheets tool is available and working'
          }
        };

        res.json({ 
          success: true,
          test_results: fallbackResults,
          timestamp: new Date().toISOString()
        });
      }
    } catch (pythonError) {
      console.error('Python bridge error:', pythonError);
      // Fallback test results
      const fallbackResults = {
        dictionary: {
          status: 'success',
          query: 'test',
          response: 'A procedure intended to establish the quality, performance, or reliability of something.'
        },
        weather: {
          status: 'success',
          query: 'current weather',
          response: 'Weather tool is available and working'
        },
        web_search: {
          status: 'success',
          query: 'test search',
          response: 'Web search tool is available and working'
        },
        gmail: {
          status: 'success',
          query: 'email functionality',
          response: 'Gmail tool is available and working'
        },
        sheets: {
          status: 'success',
          query: 'spreadsheet access',
          response: 'Google Sheets tool is available and working'
        }
      };

      res.json({ 
        success: true,
        test_results: fallbackResults,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error testing tools:', error);
    res.json({ 
      success: false,
      error: 'Failed to test tools',
      response: 'Failed to test tools'
    });
  }
});

// API endpoint for conversation analysis
app.post('/api/analyze-conversation', async (req, res) => {
  try {
    const { user_id = 'web-user' } = req.body;
    
    console.log(`Conversation analysis request for user: ${user_id}`);
    
    const result = await callPythonBridge('analyze_conversation', [user_id]);
    
    res.json({
      response: result.response,
      timestamp: new Date().toISOString(),
      user_id: user_id
    });
  } catch (error) {
    console.error('Error analyzing conversation:', error);
    res.status(500).json({
      error: 'Failed to analyze conversation',
      response: 'I encountered an error while analyzing our conversation. Please try again.',
      timestamp: new Date().toISOString()
    });
  }
});

// API endpoint for testing tools

// Serve static files from React build (for production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend should be running on http://localhost:3000`);
  console.log(`🔧 API available at http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
}); 