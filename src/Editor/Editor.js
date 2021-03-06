import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import loader from '@monaco-editor/loader';
import state from 'state-local';

import MonacoContainer from '../MonacoContainer';
import useMount from '../hooks/useMount';
import useUpdate from '../hooks/useUpdate';
import usePrevious from '../hooks/usePrevious';
import { noop, getOrCreateModel } from '../utils';

const [getModelMarkersSetter, setModelMarkersSetter] = state.create({
  backup: null,
});

const viewStates = new Map();

function Editor({
  defaultValue,
  defaultLanguage,
  defaultPath,
  value,
  language,
  path,
  /* === */
  theme,
  line,
  loading,
  options,
  overrideServices,
  saveViewState,
  /* === */
  width,
  height,
  className,
  wrapperClassName,
  /* === */
  beforeMount,
  onMount,
  onChange,
  onValidate,
}) {
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isMonacoMounting, setIsMonacoMounting] = useState(true);
  const monacoRef = useRef(null);
  const editorRef = useRef(null);
  const containerRef = useRef(null);
  const onMountRef = useRef(onMount);
  const beforeMountRef = useRef(beforeMount);
  const subscriptionRef = useRef(null);
  const valueRef = useRef(value);
  const previousPath = usePrevious(path);

  useMount(() => {
    const cancelable = loader.init();

    cancelable
      .then(monaco => ((monacoRef.current = monaco) && setIsMonacoMounting(false)))
      .catch(error => error?.type !== 'cancelation' &&
        console.error('Monaco initialization: error:', error));

    return () => editorRef.current ? disposeEditor() : cancelable.cancel();
  });

  useUpdate(() => {
    const model = getOrCreateModel(
      monacoRef.current,
      defaultValue || value,
      defaultLanguage || language,
      path,
    );

    if (model !== editorRef.current.getModel()) {
      saveViewState && viewStates.set(previousPath, editorRef.current.saveViewState());
      editorRef.current.setModel(model);
      saveViewState && editorRef.current.restoreViewState(viewStates.get(path));
    }
  }, [path], isEditorReady);

  useUpdate(() => {
    editorRef.current.updateOptions(options);
  }, [options], isEditorReady);

  useUpdate(() => {
    if (editorRef.current.getOption(monacoRef.current.editor.EditorOption.readOnly)) {
      editorRef.current.setValue(value);
    } else {
      if (value !== editorRef.current.getValue()) {
        editorRef.current.executeEdits('', [{
          range: editorRef.current.getModel().getFullModelRange(),
          text: value,
          forceMoveMarkers: true,
        }]);

        editorRef.current.pushUndoStop();
      }
    }
  }, [value], isEditorReady);

  useUpdate(() => {
    monacoRef.current.editor.setModelLanguage(editorRef.current.getModel(), language);
  }, [language], isEditorReady);

  useUpdate(() => {
    editorRef.current.setScrollPosition({ scrollTop: line });
  }, [line], isEditorReady);

  useUpdate(() => {
    monacoRef.current.editor.setTheme(theme);
  }, [theme], isEditorReady);

  const createEditor = useCallback(() => {
    beforeMountRef.current(monacoRef.current);
    const defaultModel = getOrCreateModel(
      monacoRef.current,
      value || defaultValue,
      defaultLanguage || language,
      path || defaultPath,
    );

    editorRef.current = monacoRef.current.editor.create(containerRef.current, {
      model: defaultModel,
      automaticLayout: true,
      ...options,
    }, overrideServices);

    monacoRef.current.editor.setTheme(theme);

    if (!getModelMarkersSetter().backup) {
      setModelMarkersSetter({
        backup: monacoRef.current.editor.setModelMarkers,
      });
    }

    setIsEditorReady(true);
  }, [
    defaultValue,
    defaultLanguage,
    defaultPath,
    value,
    language,
    path,
    options,
    overrideServices,
    theme,
  ]);

  useEffect(() => {
    if (isEditorReady) {
      onMountRef.current(
        editorRef.current,
        monacoRef.current,
      );
    }
  }, [isEditorReady]);

  useEffect(() => {
    !isMonacoMounting && !isEditorReady && createEditor();
  }, [isMonacoMounting, isEditorReady, createEditor]);

  // subscription
  // to avoid unnecessary updates (attach - dispose listener) in subscription
  valueRef.current = value;

  useEffect(() => {
    if (isEditorReady && onChange) {
      subscriptionRef.current?.dispose();
      subscriptionRef.current = editorRef.current?.onDidChangeModelContent(event => {
        const editorValue = editorRef.current.getValue();

        if (valueRef.current !== editorValue) {
          onChange(editorValue, event);
        }
      });
    }
  }, [isEditorReady, onChange]);

  // onValidate
  useEffect(() => {
    if (isEditorReady) {
      monacoRef.current.editor.setModelMarkers = function(model, owner, markers) {
        getModelMarkersSetter().backup?.call(
          monacoRef.current.editor,
          model,
          owner,
          markers,
        );

        if (markers.length !== 0) {
          onValidate?.(markers);
        }
      }
    }
  }, [isEditorReady, onValidate]);

  function disposeEditor() {
    subscriptionRef.current?.dispose();
    editorRef.current.getModel()?.dispose();
    editorRef.current.dispose();
  }

  return (
    <MonacoContainer
      width={width}
      height={height}
      isEditorReady={isEditorReady}
      loading={loading}
      _ref={containerRef}
      className={className}
      wrapperClassName={wrapperClassName}
    />
  );
}

Editor.propTypes = {
  defaultValue: PropTypes.string,
  defaultPath: PropTypes.string,
  defaultLanguage: PropTypes.string,
  value: PropTypes.string,
  language: PropTypes.string,
  path: PropTypes.string,
  /* === */
  theme: PropTypes.string,
  line: PropTypes.number,
  loading: PropTypes.oneOfType([PropTypes.element, PropTypes.string]),
  options: PropTypes.object,
  overrideServices: PropTypes.object,
  saveViewState: PropTypes.bool,
  /* === */
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  className: PropTypes.string,
  wrapperClassName: PropTypes.string,
  /* === */
  beforeMount: PropTypes.func,
  onMount: PropTypes.func,
  onChange: PropTypes.func,
  onValidate: PropTypes.func,
};

Editor.defaultProps = {
  defaultPath: 'inmemory://model/1',
  /* === */
  theme: 'light',
  loading: 'Loading...',
  options: {},
  overrideServices: {},
  saveViewState: true,
  /* === */
  width: '100%',
  height: '100%',
  /* === */
  beforeMount: noop,
  onMount: noop,
  onValidate: noop,
};

export default Editor;
