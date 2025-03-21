
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Video = require('../models/Video');
const { authenticate } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure profile picture upload
const profilePicStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'uploads/profiles';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'profile-' + uniqueSuffix + ext);
  }
});

const profilePicUpload = multer({
  storage: profilePicStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
}).single('profilePicture');

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id, '-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Add subscriber count
    const userObj = user.toObject();
    userObj.subscriberCount = user.subscribers.length;
    
    res.json(userObj);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { username, bio } = req.body;
    const userId = req.user._id;
    
    // Validate username if provided
    if (username) {
      const existingUser = await User.findOne({ 
        username, 
        _id: { $ne: userId } 
      });
      
      if (existingUser) {
        return res.status(400).json({ message: 'Username already taken' });
      }
    }
    
    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        ...(username && { username }),
        ...(bio !== undefined && { bio })
      },
      { new: true, select: '-password' }
    );
    
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload profile picture
router.post('/profile-picture', authenticate, (req, res) => {
  profilePicUpload(req, res, async function(err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large. Maximum size is 5MB.' });
      }
      return res.status(400).json({ message: err.message });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }
    
    // No error, continue
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      const userId = req.user._id;
      const profilePicturePath = `/${req.file.path}`;
      
      // Update user profile picture
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { profilePicture: profilePicturePath },
        { new: true, select: '-password' }
      );
      
      res.json(updatedUser);
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });
});

// Subscribe to a channel
router.post('/subscribe/:channelId', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const subscriberId = req.user._id;
    
    // Check if user is trying to subscribe to themselves
    if (channelId === subscriberId.toString()) {
      return res.status(400).json({ message: 'Cannot subscribe to your own channel' });
    }
    
    // Check if channel exists
    const channel = await User.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    
    // Check if already subscribed
    const alreadySubscribed = channel.subscribers.includes(subscriberId);
    if (alreadySubscribed) {
      return res.status(400).json({ message: 'Already subscribed to this channel' });
    }
    
    // Add subscriber to channel's subscribers
    await User.findByIdAndUpdate(
      channelId,
      { $push: { subscribers: subscriberId } }
    );
    
    // Add channel to user's subscriptions
    await User.findByIdAndUpdate(
      subscriberId,
      { $push: { subscribedTo: channelId } }
    );
    
    res.json({ message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Error subscribing to channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unsubscribe from a channel
router.delete('/unsubscribe/:channelId', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const subscriberId = req.user._id;
    
    // Check if channel exists
    const channel = await User.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    
    // Check if subscribed
    const isSubscribed = channel.subscribers.includes(subscriberId);
    if (!isSubscribed) {
      return res.status(400).json({ message: 'Not subscribed to this channel' });
    }
    
    // Remove subscriber from channel's subscribers
    await User.findByIdAndUpdate(
      channelId,
      { $pull: { subscribers: subscriberId } }
    );
    
    // Remove channel from user's subscriptions
    await User.findByIdAndUpdate(
      subscriberId,
      { $pull: { subscribedTo: channelId } }
    );
    
    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing from channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check if user is subscribed to a channel
router.get('/check-subscription/:channelId', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const subscriberId = req.user._id;
    
    // Check if channel exists
    const channel = await User.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    
    const isSubscribed = channel.subscribers.includes(subscriberId);
    
    res.json({ isSubscribed });
  } catch (error) {
    console.error('Error checking subscription:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's subscriptions
router.get('/subscriptions', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const user = await User.findById(userId).populate('subscribedTo', 'username profilePicture');
    
    res.json(user.subscribedTo);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's liked videos
router.get('/liked-videos', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const likedVideos = await Video.find({ likes: userId })
      .sort({ createdAt: -1 })
      .populate('user', 'username profilePicture')
      .lean();
    
    res.json(likedVideos);
  } catch (error) {
    console.error('Error fetching liked videos:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's watch history (if implemented)
router.get('/history', authenticate, async (req, res) => {
  // This would require a History model tracking user views
  // For simplicity, just return an empty array for now
  res.json([]);
});

module.exports = router;
