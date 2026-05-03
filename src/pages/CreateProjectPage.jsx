import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import NewProjectModal from '@/components/NewProjectModal';
import { useLang } from '@/i18n/LangContext';

export default function CreateProjectPage({ user }) {
  const { t } = useLang();
  const navigate = useNavigate();

  return (
    <>
      <Header title={t('newProject')} subtitle={t('newProjectPageSub')} />
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 24,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <NewProjectModal
          variant="embedded"
          userId={user?.id}
          onClose={() => navigate('/hub')}
          onCreated={(id) => {
            if (id) navigate(`/project/${id}/sprints`);
            else navigate('/hub');
          }}
        />
      </div>
    </>
  );
}
