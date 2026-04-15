export function useCopy() {
  return {
    copied: false,
    copy: (_text: string) => {
      void _text;
    },
  };
}
