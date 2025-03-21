
const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const { authenticate } = require('../middleware/auth');

// Get replies to a comment
router.get('/:id/replies', async (req, res) => {
  try {
    const { id } = req.params;
    
    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    const replies = await Comment.find({ parentComment: id })
      .sort({ createdAt: 1 })
      .populate('user', 'username profilePicture')
      .lean();
    
    res.json(replies);
  } catch (error) {
    console.error('Error fetching replies:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Like a comment
router.post('/:id/like', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Check if already liked
    if (comment.likes.includes(userId)) {
      return res.status(400).json({ message: 'Comment already liked' });
    }
    
    // Remove from dislikes if present
    if (comment.dislikes.includes(userId)) {
      comment.dislikes = comment.dislikes.filter(id => id.toString() !== userId.toString());
    }
    
    // Add to likes
    comment.likes.push(userId);
    await comment.save();
    
    res.json({ 
      likes: comment.likes.length, 
      dislikes: comment.dislikes.length 
    });
  } catch (error) {
    console.error('Error liking comment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unlike a comment
router.delete('/:id/unlike', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Remove from likes if present
    if (comment.likes.includes(userId)) {
      comment.likes = comment.likes.filter(id => id.toString() !== userId.toString());
      await comment.save();
    }
    
    res.json({ 
      likes: comment.likes.length, 
      dislikes: comment.dislikes.length 
    });
  } catch (error) {
    console.error('Error unliking comment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Dislike a comment
router.post('/:id/dislike', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Check if already disliked
    if (comment.dislikes.includes(userId)) {
      return res.status(400).json({ message: 'Comment already disliked' });
    }
    
    // Remove from likes if present
    if (comment.likes.includes(userId)) {
      comment.likes = comment.likes.filter(id => id.toString() !== userId.toString());
    }
    
    // Add to dislikes
    comment.dislikes.push(userId);
    await comment.save();
    
    res.json({ 
      likes: comment.likes.length, 
      dislikes: comment.dislikes.length 
    });
  } catch (error) {
    console.error('Error disliking comment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Undislike a comment
router.delete('/:id/undislike', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Remove from dislikes if present
    if (comment.dislikes.includes(userId)) {
      comment.dislikes = comment.dislikes.filter(id => id.toString() !== userId.toString());
      await comment.save();
    }
    
    res.json({ 
      likes: comment.likes.length, 
      dislikes: comment.dislikes.length 
    });
  } catch (error) {
    console.error('Error undisliking comment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a comment
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ message: 'Comment content is required' });
    }
    
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Check if user is the comment author
    if (comment.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized to update this comment' });
    }
    
    comment.content = content;
    await comment.save();
    
    res.json(comment);
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a comment
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Check if user is the comment author or admin
    if (comment.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }
    
    // If this is a parent comment, delete all replies
    if (!comment.parentComment) {
      await Comment.deleteMany({ parentComment: id });
    } else {
      // If it's a reply, remove it from parent's replies array
      await Comment.findByIdAndUpdate(
        comment.parentComment,
        { $pull: { replies: id } }
      );
    }
    
    await Comment.findByIdAndDelete(id);
    
    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
