
const express = require('express');
const router = express.Router();
const { getVideoDurationInSeconds } = require('get-video-duration');
const Video = require('../models/Video');
const Comment = require('../models/Comment');
const User = require('../models/User');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { videoUpload, handleUploadError } = require('../middleware/upload');

// Get all videos (paginated)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const videos = await Video.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'username profilePicture')
      .lean();
    
    // Get total count for pagination
    const total = await Video.countDocuments();
    
    res.json(videos);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get videos by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const videos = await Video.find({ category })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'username profilePicture')
      .lean();
    
    res.json(videos);
  } catch (error) {
    console.error('Error fetching videos by category:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search videos
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    const videos = await Video.find(
      { $text: { $search: q } },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' }, views: -1 })
      .limit(50)
      .populate('user', 'username profilePicture')
      .lean();
    
    res.json(videos);
  } catch (error) {
    console.error('Error searching videos:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get videos by user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const videos = await Video.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate('user', 'username profilePicture')
      .lean();
    
    res.json(videos);
  } catch (error) {
    console.error('Error fetching user videos:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a single video by ID
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const video = await Video.findById(id)
      .populate('user', 'username profilePicture subscribers')
      .lean();
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Add subscriber count to user object
    video.user.subscriberCount = video.user.subscribers ? video.user.subscribers.length : 0;
    delete video.user.subscribers;
    
    // Add like and dislike counts
    video.likes = video.likes ? video.likes.length : 0;
    video.dislikes = video.dislikes ? video.dislikes.length : 0;
    
    // Check if authenticated user has liked/disliked
    if (req.user) {
      const fullVideo = await Video.findById(id);
      video.hasLiked = fullVideo.likes.includes(req.user._id);
      video.hasDisliked = fullVideo.dislikes.includes(req.user._id);
    }
    
    res.json(video);
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get recommended videos
router.get('/:id/recommended', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the current video to find similar ones
    const currentVideo = await Video.findById(id);
    
    if (!currentVideo) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Find videos in the same category, excluding the current one
    const recommendedVideos = await Video.find({
      _id: { $ne: id },
      category: currentVideo.category
    })
      .sort({ views: -1, createdAt: -1 })
      .limit(15)
      .populate('user', 'username profilePicture')
      .lean();
    
    // If we don't have enough recommendations, add some popular videos
    if (recommendedVideos.length < 10) {
      const popularVideos = await Video.find({
        _id: { $ne: id },
        _id: { $nin: recommendedVideos.map(v => v._id) }
      })
        .sort({ views: -1 })
        .limit(15 - recommendedVideos.length)
        .populate('user', 'username profilePicture')
        .lean();
      
      recommendedVideos.push(...popularVideos);
    }
    
    res.json(recommendedVideos);
  } catch (error) {
    console.error('Error fetching recommended videos:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Increment view count
router.post('/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    
    const video = await Video.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true }
    );
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    res.json({ views: video.views });
  } catch (error) {
    console.error('Error incrementing view count:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload a new video
router.post('/', authenticate, videoUpload, handleUploadError, async (req, res) => {
  try {
    if (!req.files || !req.files.video || !req.files.thumbnail) {
      return res.status(400).json({ message: 'Video and thumbnail files are required' });
    }
    
    const { title, description, category, tags } = req.body;
    const videoPath = req.files.video[0].path;
    const thumbnailPath = req.files.thumbnail[0].path;
    
    // Get video duration
    let duration = 0;
    try {
      duration = await getVideoDurationInSeconds(videoPath);
    } catch (err) {
      console.error('Error getting video duration:', err);
    }
    
    // Create video document
    const video = new Video({
      title,
      description,
      videoUrl: `/${videoPath}`,
      thumbnailUrl: `/${thumbnailPath}`,
      duration,
      user: req.user._id,
      category: category || 'Entertainment',
      tags: tags ? tags.split(',').map(tag => tag.trim()) : []
    });
    
    await video.save();
    
    // Populate user data for response
    await video.populate('user', 'username profilePicture');
    
    res.status(201).json(video);
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({ message: 'Server error during video upload' });
  }
});

// Update a video
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, tags } = req.body;
    
    // Find video and check ownership
    const video = await Video.findById(id);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    if (video.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized to update this video' });
    }
    
    // Update fields
    video.title = title || video.title;
    video.description = description || video.description;
    video.category = category || video.category;
    
    if (tags) {
      video.tags = tags.split(',').map(tag => tag.trim());
    }
    
    await video.save();
    
    res.json(video);
  } catch (error) {
    console.error('Error updating video:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a video
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find video and check ownership
    const video = await Video.findById(id);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    if (video.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this video' });
    }
    
    // Delete video
    await Video.findByIdAndDelete(id);
    
    // Delete related comments
    await Comment.deleteMany({ video: id });
    
    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Like a video
router.post('/:id/like', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const video = await Video.findById(id);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Check if already liked
    if (video.likes.includes(userId)) {
      return res.status(400).json({ message: 'Video already liked' });
    }
    
    // Remove from dislikes if present
    if (video.dislikes.includes(userId)) {
      video.dislikes = video.dislikes.filter(id => id.toString() !== userId.toString());
    }
    
    // Add to likes
    video.likes.push(userId);
    await video.save();
    
    res.json({ 
      likes: video.likes.length, 
      dislikes: video.dislikes.length 
    });
  } catch (error) {
    console.error('Error liking video:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unlike a video
router.delete('/:id/unlike', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const video = await Video.findById(id);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Remove from likes if present
    if (video.likes.includes(userId)) {
      video.likes = video.likes.filter(id => id.toString() !== userId.toString());
      await video.save();
    }
    
    res.json({ 
      likes: video.likes.length, 
      dislikes: video.dislikes.length 
    });
  } catch (error) {
    console.error('Error unliking video:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Dislike a video
router.post('/:id/dislike', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const video = await Video.findById(id);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Check if already disliked
    if (video.dislikes.includes(userId)) {
      return res.status(400).json({ message: 'Video already disliked' });
    }
    
    // Remove from likes if present
    if (video.likes.includes(userId)) {
      video.likes = video.likes.filter(id => id.toString() !== userId.toString());
    }
    
    // Add to dislikes
    video.dislikes.push(userId);
    await video.save();
    
    res.json({ 
      likes: video.likes.length, 
      dislikes: video.dislikes.length 
    });
  } catch (error) {
    console.error('Error disliking video:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Undislike a video
router.delete('/:id/undislike', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const video = await Video.findById(id);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Remove from dislikes if present
    if (video.dislikes.includes(userId)) {
      video.dislikes = video.dislikes.filter(id => id.toString() !== userId.toString());
      await video.save();
    }
    
    res.json({ 
      likes: video.likes.length, 
      dislikes: video.dislikes.length 
    });
  } catch (error) {
    console.error('Error undisliking video:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check like/dislike status
router.get('/:id/like-status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const video = await Video.findById(id);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    const liked = video.likes.includes(userId);
    const disliked = video.dislikes.includes(userId);
    
    res.json({ liked, disliked });
  } catch (error) {
    console.error('Error checking like status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get comments for a video
router.get('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    
    const comments = await Comment.find({ 
      video: id,
      parentComment: null // Only get top-level comments
    })
      .sort({ createdAt: -1 })
      .populate('user', 'username profilePicture')
      .lean();
    
    res.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a comment to a video
router.post('/:id/comments', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, parentCommentId } = req.body;
    
    if (!content) {
      return res.status(400).json({ message: 'Comment content is required' });
    }
    
    // Check if video exists
    const videoExists = await Video.exists({ _id: id });
    if (!videoExists) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Create comment
    const comment = new Comment({
      content,
      user: req.user._id,
      video: id,
      parentComment: parentCommentId || null
    });
    
    await comment.save();
    
    // If this is a reply, add it to the parent comment's replies array
    if (parentCommentId) {
      await Comment.findByIdAndUpdate(
        parentCommentId,
        { $push: { replies: comment._id } }
      );
    }
    
    // Populate user data for response
    await comment.populate('user', 'username profilePicture');
    
    res.status(201).json(comment);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
