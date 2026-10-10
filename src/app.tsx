import { DialogHost } from './ui/dialogs';
import { EditorScreen } from './ui/EditorScreen';
import { GalleryScreen } from './ui/Gallery';
import { session } from './state';

export function App() {
  return (
    <>
      {session.value ? <EditorScreen /> : <GalleryScreen />}
      <DialogHost />
    </>
  );
}
