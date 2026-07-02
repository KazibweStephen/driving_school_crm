import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SessionExpired } from './core/session-expired/session-expired';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SessionExpired],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
