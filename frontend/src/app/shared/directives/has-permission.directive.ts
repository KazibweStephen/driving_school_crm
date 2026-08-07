import { Directive, Input, TemplateRef, ViewContainerRef } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective {
  private permission?: string;
  private permissions?: string[];
  private thenBlocked: boolean = false;

  constructor(
    private templateRef: TemplateRef<unknown>,
    private viewContainer: ViewContainerRef,
    private auth: AuthService,
  ) {}

  @Input()
  set appHasPermission(value: string | string[]) {
    if (Array.isArray(value)) {
      this.permissions = value;
      this.permission = undefined;
    } else {
      this.permission = value;
      this.permissions = undefined;
    }
    this.updateView();
  }

  private updateView() {
    const allowed = this.permission
      ? this.auth.hasPermission(this.permission)
      : this.permissions
        ? this.auth.hasAnyPermission(this.permissions)
        : true;

    if (allowed && !this.thenBlocked) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.thenBlocked = true;
    } else if (!allowed && this.thenBlocked) {
      this.viewContainer.clear();
      this.thenBlocked = false;
    }
  }
}
