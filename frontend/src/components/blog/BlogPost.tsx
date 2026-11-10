import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Post } from '../../types/post';
import PostAPI from '../../api/posts.api';
import MarkdownRenderer from './MarkdownRenderer';
import BlogCommentList from './BlogCommentList';

function BlogPost() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { isLoggedIn, role } = useAuth();

  useEffect(() => {
    if (!id) return;
    PostAPI.getPostById(id)
      .then((p) => setPost(p))
      .catch(() => setPost(null));
  }, [id]);

  const handleDelete = async () => {
    if (!id || !confirm('Are you sure you want to delete this post?')) return;
    
    setDeleting(true);
    try {
      await PostAPI.deletePost(id);
      navigate('/blog');
    } catch {
      alert('Failed to delete post');
      setDeleting(false);
    }
  };

  if (!post) {
    return (
      <>
        <div className="page-container">
          <Link to="/blog" className="link">$ cd ../</Link>
          <p>No post found</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-container">
        <div className="header">
          <Link to="/blog" className="link">$ cd ../</Link>
          {isLoggedIn && role === 'admin' && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={handleDelete} 
                disabled={deleting}
                className="button compact delete"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <Link to={`/blog/edit/${id}`} className="button compact">
                Edit Post
              </Link>
            </div>
          )}
        </div>

        <div className="post-content">
          <h1 className="title large left"> # {post.title}</h1>
          <div className="post-summary">{post.summary}</div>

          <div className="post-body">
            <MarkdownRenderer content={post.content} images={post.images}/>
          </div>
        </div>
        
        <BlogCommentList postId={id!} />
      </div>
    </>
  );
}

export default BlogPost;