import { useParams, useNavigate } from 'react-router-dom';
import Canvas from '@/components/canvas/Canvas';

const CanvasPage = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();

  if (!documentId) {
    navigate('/');
    return null;
  }

  return <Canvas documentId={documentId} onBackToMenu={() => navigate('/')} />;
};

export default CanvasPage;
