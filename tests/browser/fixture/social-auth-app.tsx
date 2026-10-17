import {createRoot} from 'react-dom/client';
import {Platform} from '../../../app/ui/platform';
import '../../../app/ui/final/frontend.css';
import '../../../app/ui/final/tokens.css';
import '../../../app/ui/final/integration.css';
createRoot(document.getElementById('root')!).render(<Platform path={['signup']} user={null}/>);
