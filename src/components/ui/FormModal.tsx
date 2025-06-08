
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { Trash2, Loader2, Save, Pencil } from "lucide-react";

interface FormModalProps<T> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  formId: string;
  children: ReactNode;
  isSubmitting: boolean;
  editingItem?: T | null;
  onDeleteConfirm?: () => void;
  isDeleting?: boolean;
  deleteButtonLabel?: string;
  submitButtonLabel?: string;
  disableSubmit?: boolean;
  isEditMode: boolean;
  onEditModeToggle?: () => void;
  additionalFooterActions?: ReactNode; // New prop
}

export function FormModal<T>({
  isOpen,
  onClose,
  title,
  description,
  formId,
  children,
  isSubmitting,
  editingItem,
  onDeleteConfirm,
  isDeleting,
  deleteButtonLabel,
  submitButtonLabel,
  disableSubmit,
  isEditMode,
  onEditModeToggle,
  additionalFooterActions, // Destructure new prop
}: FormModalProps<T>) {
  const disableActions = isSubmitting || isDeleting;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] bg-card">
        <DialogHeader>
          <DialogTitle className="font-headline">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="py-4 max-h-[70vh] overflow-y-auto pr-2">
          {children}
        </div>

        <DialogFooter className="gap-2 sm:justify-between pt-4 border-t mt-4">
          <div className="flex flex-wrap gap-2 items-center"> {/* Container for left-aligned items */}
            {additionalFooterActions} {/* Render additional actions here */}
            {editingItem && onDeleteConfirm && isEditMode && ( // Delete button
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDeleteConfirm}
                disabled={disableActions}
                className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground focus:ring-destructive/50"
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                {isDeleting ? "Excluindo..." : (deleteButtonLabel || "Excluir")}
              </Button>
            )}
          </div>
          <div className="flex gap-2 justify-end"> {/* Container for right-aligned items */}
            <Button type="button" variant="outline" onClick={onClose} disabled={disableActions}>
              {isEditMode && editingItem ? "Cancelar Edição" : "Fechar"}
            </Button>

            {!!editingItem && !isEditMode && onEditModeToggle && (
              <Button
                type="button"
                onClick={onEditModeToggle}
                disabled={disableActions}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Button>
            )}

            {isEditMode && (
              <Button
                type="submit"
                form={formId}
                disabled={disableActions || disableSubmit}
                className="bg-primary hover:bg-primary/90"
              >
                {isSubmitting ? (
                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                   <Save className="mr-2 h-4 w-4" />
                )}
                {isSubmitting ? (isDeleting ? "Processando..." : "Salvando...") : (submitButtonLabel || (editingItem ? "Salvar Alterações" : "Criar"))}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
