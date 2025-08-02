const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
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

// Configuration for remote agentic server
const AGENTIC_SERVER_URL = 'https://backend-python-y57q.onrender.com';
const AGENTIC_TIMEOUT = parseInt(process.env.AGENTIC_TIMEOUT) || 30000; // 30 seconds

// Function to call remote agentic server
async function callAgenticServer(endpoint, data = {}) {
  try {
    console.log(`Calling agentic server: ${AGENTIC_SERVER_URL}${endpoint}`);
    console.log('Request data:', data);
    
    const response = await axios({
      method: 'POST',
      url: `${AGENTIC_SERVER_URL}${endpoint}`,
      data: data,
      timeout: AGENTIC_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ModuMentor-NodeJS-Server/1.0'
      }
    });
    
    console.log('Agentic server response:', response.data);
    return response.data;
    
  } catch (error) {
    console.error('Agentic server error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Agentic server is not reachable. Please check if it\'s running.');
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error('Agentic server request timed out.');
    } else if (error.response) {
      // Server responded with error status
      throw new Error(`Agentic server error: ${error.response.status} - ${error.response.data?.error || 'Unknown error'}`);
    } else {
      throw new Error(`Network error: ${error.message}`);
    }
  }
}

// Health check for agentic server
async function checkAgenticHealth() {
  try {
    const response = await axios.get(`${AGENTIC_SERVER_URL}/health`, {
      timeout: 5000
    });
    return response.data;
  } catch (error) {
    console.error('Agentic server health check failed:', error.message);
    return null;
  }
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

  socket.on('message', async (data) => {
    console.log('Message received:', data);
    
    try {
      const result = await callAgenticServer('/api/chat', {
        message: data.message,
        user_id: data.user_id || socket.id
      });
      
      socket.emit('message', {
        message: result.response,
        timestamp: new Date().toISOString(),
        success: result.success
      });
      
    } catch (error) {
      socket.emit('message', {
        message: `Error: ${error.message}`,
        timestamp: new Date().toISOString(),
        success: false
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    connectedUsers.delete(socket.id);
  });
});

// API Routes
app.get('/api/health', async (req, res) => {
  try {
    const agenticHealth = await checkAgenticHealth();
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      connectedUsers: connectedUsers.size,
      agenticServer: {
        url: AGENTIC_SERVER_URL,
        status: agenticHealth ? 'connected' : 'disconnected',
        details: agenticHealth
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      error: error.message 
    });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, user_id } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    console.log(`Chat request from ${user_id}: ${message}`);

    // Call remote agentic server
    try {
      const result = await callAgenticServer('/api/chat', {
        message: message,
        user_id: user_id
      });
      
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
    } catch (agenticError) {
      console.error('Agentic server error:', agenticError);
      // Fallback to placeholder response if agentic server fails
      const fallbackResponse = `I received your message: "${message}". The AI agent is currently unavailable. Please try again later.`;
      res.json({
        response: fallbackResponse,
        timestamp: new Date().toISOString(),
        user_id: user_id,
        error: agenticError.message
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
      const result = await callAgenticServer('/api/clear', { user_id });
      
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
    } catch (agenticError) {
      console.error('Agentic server error:', agenticError);
      // Even if agentic server fails, we can still clear the conversation
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

app.get('/api/help', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    console.log(`Help request from user: ${user_id}`);

    try {
      const result = await callAgenticServer('/api/help', { user_id });
      
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
- 🔍 **Web Search** - Search the internet for current information
- 📚 **Dictionary** - Get word definitions and translations
- 📧 **Email Management** - Send and manage emails
- 📊 **Spreadsheet Operations** - Work with Google Sheets
- 🎵 **Lyrics Search** - Find song lyrics
- 🧠 **Advanced AI** - Enhanced AI capabilities

**Note:** The AI agent is currently unavailable. Please try again later.`;
        
        res.json({ 
          success: true,
          response: fallbackHelp,
          timestamp: new Date().toISOString()
        });
      }
    } catch (agenticError) {
      console.error('Agentic server error:', agenticError);
      res.json({ 
        success: true,
        response: 'Help system is currently unavailable. Please try again later.',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Error in help API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    console.log(`Analyzing conversation for user: ${user_id}`);
    
    try {
      const result = await callAgenticServer('/api/analyze', { user_id });
      
      if (result.success) {
        res.json({
          success: true,
          analysis: result.analysis,
          timestamp: new Date().toISOString()
        });
      } else {
        res.json({
          success: false,
          error: 'Failed to analyze conversation',
          timestamp: new Date().toISOString()
        });
      }
    } catch (agenticError) {
      console.error('Agentic server error:', agenticError);
      res.json({
        success: false,
        error: 'Analysis service is currently unavailable',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Error in analyze API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/tools', async (req, res) => {
  try {
    console.log('Getting available tools');
    
    try {
      const result = await callAgenticServer('/api/tools');
      
      if (result.success) {
        res.json({
          success: true,
          tools: result.tools,
          timestamp: new Date().toISOString()
        });
      } else {
        res.json({
          success: false,
          error: 'Failed to get tools',
          timestamp: new Date().toISOString()
        });
      }
    } catch (agenticError) {
      console.error('Agentic server error:', agenticError);
      res.json({
        success: false,
        error: 'Tools service is currently unavailable',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Error in tools API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🚀 ModuMentor Node.js Server running on ${HOST}:${PORT}`);
  console.log(`🔗 Agentic Server URL: ${AGENTIC_SERVER_URL}`);
  console.log(`⏱️ Agentic Timeout: ${AGENTIC_TIMEOUT}ms`);
  
  // Check agentic server health on startup
  checkAgenticHealth().then(health => {
    if (health) {
      console.log('✅ Agentic server is healthy and connected');
    } else {
      console.log('⚠️ Agentic server is not reachable');
    }
  });
}); 