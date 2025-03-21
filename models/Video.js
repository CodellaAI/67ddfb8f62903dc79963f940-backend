
const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 5000
  },
  videoUrl: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    default: 0
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  views: {
    type: Number,
    default: 0
  },
  category: {
    type: String,
    enum: [
      'Entertainment', 'Music', 'Sports', 'Gaming', 'Education',
      'Science & Technology', 'Travel', 'News', 'Comedy', 'Vlogs',
      'Documentaries', 'Food', 'Fashion', 'Beauty', 'Pets & Animals'
    ],
    default: 'Entertainment'
  },
  tags: [{
    type: String,
    trim: true
  }],
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  dislikes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for like count
videoSchema.virtual('likeCount').get(function() {
  return this.likes.length;
});

// Virtual for dislike count
videoSchema.virtual('dislikeCount').get(function() {
  return this.dislikes.length;
});

// Create text indexes for search
videoSchema.index({ title: 'text', description: 'text', tags: 'text' });

const Video = mongoose.model('Video', videoSchema);

module.exports = Video;
